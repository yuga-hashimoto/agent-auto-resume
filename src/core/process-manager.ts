import pty from "node-pty";
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

function adjustSpawnCommand(resolvedCmd: string, originalArgs: string[]): { cmd: string; args: string[] } {
  try {
    if (fs.existsSync(resolvedCmd)) {
      const stat = fs.statSync(resolvedCmd);
      if (stat.isFile()) {
        const fd = fs.openSync(resolvedCmd, "r");
        const buffer = Buffer.alloc(150);
        const bytesRead = fs.readSync(fd, buffer, 0, 150, 0);
        fs.closeSync(fd);

        const content = buffer.toString("utf-8", 0, bytesRead);
        if (content.startsWith("#!")) {
          const firstLine = content.split("\n")[0].trim();
          const shebangCmd = firstLine.slice(2).trim();

          if (shebangCmd.includes("node")) {
            return {
              cmd: process.argv[0],
              args: [resolvedCmd, ...originalArgs]
            };
          }
          if (shebangCmd.includes("bash") || shebangCmd.includes("sh")) {
            const shell = shebangCmd.split(" ")[0];
            const resolvedShell = shell.endsWith("bash") ? "/bin/bash" : "/bin/sh";
            return {
              cmd: resolvedShell,
              args: [resolvedCmd, ...originalArgs]
            };
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return { cmd: resolvedCmd, args: originalArgs };
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

  let ptyProcess: pty.IPty;
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
    const spawnConfig = adjustSpawnCommand(resolvedCmd, args);

    logger.info(`Spawning command: ${spawnConfig.cmd} with args: ${JSON.stringify(spawnConfig.args)} (original: ${cmd})`, "aar");

    ptyProcess = pty.spawn(spawnConfig.cmd, spawnConfig.args, {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: state.cwd,
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
