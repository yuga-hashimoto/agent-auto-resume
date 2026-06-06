import { spawn, ChildProcess } from "child_process";
import os from "os";
import fs from "fs-extra";
import path from "path";
import { SessionState } from "./types.js";
import { updateSession, getSession } from "./session-store.js";
import { detectLimit } from "./detector.js";
import { getProvider } from "../providers/index.js";
import { logger } from "./logger.js";

function resolveCommandPath(cmd: string, customPath: string): string {
  if (cmd.includes("/") || cmd.includes("\\")) {
    return cmd;
  }
  const paths = customPath.split(path.delimiter);
  for (const p of paths) {
    const fullPath = path.join(p, cmd);
    try {
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          return fullPath;
        }
      }
    } catch {
      // ignore
    }
  }
  return cmd;
}

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

  let child: ChildProcess;
  try {
    const pathEnv = process.env.PATH || "";
    const home = os.homedir();
    const extraPaths = [
      "/usr/local/bin",
      "/opt/homebrew/bin",
      `${home}/.npm-global/bin`,
      `${home}/.hermes/node/bin`,
      `${home}/.local/bin`,
    ];
    const newPath = [
      ...extraPaths.filter((p) => !pathEnv.includes(p)),
      pathEnv,
    ].join(":");

    const resolvedCmd = resolveCommandPath(cmd, newPath);

    logger.info(`Spawning child process: ${resolvedCmd} with args: ${JSON.stringify(args)} (original: ${cmd})`, "aar");

    child = spawn(resolvedCmd, args, {
      cwd: state.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: newPath,
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

    // 自動プロンプト入力がある場合、プロセス起動を少し待ってから送信する
    if (resumeInput && child.stdin) {
      setTimeout(() => {
        try {
          child.stdin?.write(resumeInput);
          logger.info(`Sent resume input to session ${state.id}: ${JSON.stringify(resumeInput)}`, "aar");
        } catch (err: any) {
          logger.error(`Failed to write resume input to child stdin: ${err.message}`, "aar");
        }
      }, 2000);
    }

    const handleData = (data: Buffer) => {
      const str = data.toString("utf-8");
      accumulatedOutput += str;
      if (accumulatedOutput.length > 8192) {
        accumulatedOutput = accumulatedOutput.slice(-4096);
      }

      logger.debug(`[Child Output ${state.id}] ${str.trim()}`, "aar");

      if (!limitDetected) {
        const detection = detectLimit(accumulatedOutput, state.provider);
        if (detection.matched) {
          limitDetected = true;
          logger.warn(`Limit re-detected during resume for session ${state.id}`, "aar");

          const resetAtStr = detection.resetAt ? detection.resetAt.toISOString() : undefined;
          updateSession(state.id, {
            status: "waiting_limit_reset",
            lastLimitDetectedAt: new Date().toISOString(),
            resetAt: resetAtStr,
            lastOutputSnippet: accumulatedOutput.slice(-1000),
          }).catch(() => {});

          try {
            child.kill();
          } catch {
            // ignore
          }
        }
      }
    };

    if (child.stdout) {
      child.stdout.on("data", handleData);
    }
    if (child.stderr) {
      child.stderr.on("data", handleData);
    }

    child.on("error", async (err) => {
      logger.error(`Child process error for session ${state.id}: ${err.message}`, "aar");
      const current = await getSession(state.id);
      if (current && current.status === "resuming") {
        await updateSession(state.id, { status: "failed" });
      }
      resolve(false);
    });

    child.on("exit", async (code) => {
      const current = await getSession(state.id);
      if (!current) {
        return resolve(false);
      }

      if (current.status === "resuming") {
        if (code === 0) {
          logger.info(`Session ${state.id} completed successfully.`, "aar");
          await updateSession(state.id, { status: "completed" });
          resolve(true);
        } else {
          logger.info(`Session ${state.id} exited with code ${code}.`, "aar");
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
