import { spawn } from "child_process";
import fs from "fs-extra";
import { isDaemonRunning, readPid } from "./daemon-ipc.js";
import { LOG_FILE } from "./logger.js";
import { ensureDirs } from "./session-store.js";

/**
 * デーモンをバックグラウンドプロセスとして起動する。
 */
export async function startDaemonProcess(options: { tmux?: boolean } = {}): Promise<void> {
  if (await isDaemonRunning()) {
    const pid = await readPid();
    console.log(`Daemon is already running (PID: ${pid}).`);
    return;
  }

  await ensureDirs();

  const nodeBin = process.argv[0];
  const originalArgs = process.argv.slice(1);
  
  // 'start' 引数を 'run' に置換
  const args = originalArgs.map((arg) => {
    if (arg === "start") return "run";
    return arg;
  });

  // 'run' サブコマンドが含まれていない場合は追加
  if (!args.includes("run")) {
    const daemonIdx = args.indexOf("daemon");
    if (daemonIdx !== -1) {
      args.splice(daemonIdx + 1, 0, "run");
    }
  }

  // 重複フラグなどのクリーンアップ
  // '--tmux' が重複して指定されないように調整
  const cleanArgs = args.filter((a) => a !== "start" && a !== "restart");
  if (options.tmux && !cleanArgs.includes("--tmux")) {
    cleanArgs.push("--tmux");
  }

  console.log("Starting agent-auto-resume daemon in background...");

  const outFd = fs.openSync(LOG_FILE, "a");
  const errFd = fs.openSync(LOG_FILE, "a");

  const child = spawn(nodeBin, cleanArgs, {
    detached: true,
    stdio: ["ignore", outFd, errFd],
    env: {
      ...process.env,
    },
  });

  child.unref();

  // 起動完了を最大2秒待つ
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await isDaemonRunning()) {
      const pid = await readPid();
      console.log(`Daemon started successfully (PID: ${pid}). Log file: ${LOG_FILE}`);
      return;
    }
  }

  console.error("Failed to start daemon. Please check the log file for errors:");
  console.error(LOG_FILE);
}

/**
 * デーモンプロセスを停止する。
 */
export async function stopDaemonProcess(): Promise<void> {
  const pid = await readPid();
  if (!pid || !(await isDaemonRunning())) {
    console.log("Daemon is not running.");
    return;
  }

  console.log(`Stopping daemon (PID: ${pid})...`);
  try {
    process.kill(pid, "SIGTERM");
    
    // 停止するまでポーリングで待つ (最大5秒)
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!(await isDaemonRunning())) {
        console.log("Daemon stopped successfully.");
        return;
      }
    }
    
    console.warn("Daemon did not respond to SIGTERM. Force killing...");
    process.kill(pid, "SIGKILL");
    console.log("Daemon force killed.");
  } catch (err: any) {
    console.error(`Failed to stop daemon: ${err.message}`);
  }
}
