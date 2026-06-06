import path from "path";
import fs from "fs-extra";
import { BASE_DIR, ensureDirs } from "./session-store.js";

export const PID_FILE = path.join(BASE_DIR, "daemon.pid");

export async function writePid(pid: number): Promise<void> {
  await ensureDirs();
  await fs.writeFile(PID_FILE, pid.toString(), "utf-8");
}

export async function readPid(): Promise<number | undefined> {
  if (!(await fs.pathExists(PID_FILE))) {
    return undefined;
  }
  try {
    const content = await fs.readFile(PID_FILE, "utf-8");
    const pid = parseInt(content.trim(), 10);
    return isNaN(pid) ? undefined : pid;
  } catch {
    return undefined;
  }
}

export async function clearPid(): Promise<void> {
  if (await fs.pathExists(PID_FILE)) {
    await fs.remove(PID_FILE);
  }
}

export async function isDaemonRunning(): Promise<boolean> {
  const pid = await readPid();
  if (!pid) {
    return false;
  }
  try {
    // pid にシグナル 0 を送って生存確認
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err.code === "ESRCH") {
      // 存在しないプロセスなのでPIDファイルをクリーンアップ
      await clearPid();
      return false;
    }
    // EPERM の場合は権限不足だがプロセスは存在している
    return err.code === "EPERM";
  }
}
