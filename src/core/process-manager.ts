import pty from "node-pty";
import { SessionState } from "./types.js";
import { updateSession, getSession } from "./session-store.js";
import { detectLimit } from "./detector.js";
import { getProvider } from "../providers/index.js";
import { logger } from "./logger.js";

/**
 * セッションをバックグラウンド（PTY）で再開し、結果を監視する。
 * @param state セッション情報
 * @returns 再開および実行が成功した場合は true、失敗した、または再度リミットに達した場合は false
 */
export async function resumeSessionInBackground(state: SessionState): Promise<boolean> {
  const provider = getProvider(state.provider);

  const resumeCommand = await provider.getResumeCommand(state);
  const resumeInput = provider.getResumeInput ? await provider.getResumeInput(state) : undefined;

  logger.info(`Resuming session ${state.id} with command: ${resumeCommand.join(" ")}`, "aar");

  await updateSession(state.id, {
    status: "resuming",
    resumeCommand,
    resumeInput,
    attempts: state.attempts + 1,
  });

  const cmd = resumeCommand[0];
  const args = resumeCommand.slice(1);

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(cmd, args, {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: state.cwd,
      env: {
        ...process.env,
        AAR_SESSION_ID: state.id,
      },
    });
  } catch (err: any) {
    logger.error(`Failed to spawn resume command: ${err.message}`, "aar");
    await updateSession(state.id, { status: "failed" });
    return false;
  }

  return new Promise<boolean>((resolve) => {

    let limitDetected = false;
    let accumulatedOutput = "";

    // PTYへの自動プロンプト入力がある場合、プロセス起動を少し待ってから送信する
    if (resumeInput) {
      setTimeout(() => {
        try {
          ptyProcess.write(resumeInput);
          logger.info(`Sent resume input to session ${state.id}: ${JSON.stringify(resumeInput)}`, "aar");
        } catch (err: any) {
          logger.error(`Failed to write resume input to PTY: ${err.message}`, "aar");
        }
      }, 2000);
    }

    ptyProcess.onData(async (data: string) => {
      accumulatedOutput += data;
      if (accumulatedOutput.length > 8192) {
        accumulatedOutput = accumulatedOutput.slice(-4096);
      }

      logger.debug(`[PTY Output ${state.id}] ${data.trim()}`, "aar");

      if (!limitDetected) {
        const detection = detectLimit(accumulatedOutput, state.provider);
        if (detection.matched) {
          limitDetected = true;
          logger.warn(`Limit re-detected during resume for session ${state.id}`, "aar");

          const resetAtStr = detection.resetAt ? detection.resetAt.toISOString() : undefined;
          await updateSession(state.id, {
            status: "waiting_limit_reset",
            lastLimitDetectedAt: new Date().toISOString(),
            resetAt: resetAtStr,
            lastOutputSnippet: accumulatedOutput.slice(-1000),
          });

          try {
            ptyProcess.kill();
          } catch {
            // ignore
          }
        }
      }
    });

    ptyProcess.onExit(async (res) => {
      const current = await getSession(state.id);
      if (!current) {
        return resolve(false);
      }

      if (current.status === "resuming") {
        if (res.exitCode === 0) {
          logger.info(`Session ${state.id} completed successfully.`, "aar");
          await updateSession(state.id, { status: "completed" });
          resolve(true);
        } else {
          logger.info(`Session ${state.id} exited with code ${res.exitCode}.`, "aar");
          await updateSession(state.id, { status: "failed" });
          resolve(false);
        }
      } else if (current.status === "waiting_limit_reset") {
        resolve(false);
      } else {
        resolve(false);
      }
    });
  });
}
