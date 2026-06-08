import { startDaemonProcess, stopDaemonProcess } from "../core/daemon-client.js";
import { isDaemonRunning, readPid } from "../core/daemon-ipc.js";
import { getLogFile } from "../core/logger.js";
import { AarDaemon } from "../core/daemon.js";
import fs from "fs-extra";
import chalk from "chalk";

export async function handleDaemon(action: string, options: { tmux?: boolean }) {
  const cleanAction = action.toLowerCase();
  
  if (cleanAction === "start") {
    await startDaemonProcess(options);
  } else if (cleanAction === "stop") {
    await stopDaemonProcess();
  } else if (cleanAction === "restart") {
    console.log("Restarting daemon...");
    await stopDaemonProcess();
    await startDaemonProcess(options);
  } else if (cleanAction === "status") {
    const running = await isDaemonRunning();
    if (running) {
      const pid = await readPid();
      console.log(chalk.green(`Daemon is RUNNING (PID: ${pid})`));
    } else {
      console.log(chalk.red("Daemon is STOPPED"));
    }
  } else if (cleanAction === "logs") {
    const logFile = getLogFile();
    if (await fs.pathExists(logFile)) {
      const content = await fs.readFile(logFile, "utf-8");
      console.log(content);
    } else {
      console.log("No log file found.");
    }
  } else if (cleanAction === "run") {
    const daemon = new AarDaemon();
    await daemon.start(options);
  } else {
    console.error(`Unknown daemon action: ${action}`);
    process.exit(1);
  }
}
