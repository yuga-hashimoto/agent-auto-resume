import { isDaemonRunning, readPid } from "../core/daemon-ipc.js";
import { getWaitingSessions } from "../core/session-store.js";
import { getWaitMs } from "../core/scheduler.js";
import chalk from "chalk";

export async function runStatus(options: { json?: boolean }) {
  const daemonRunning = await isDaemonRunning();
  const daemonPid = await readPid();
  const waitingSessions = await getWaitingSessions();

  const statusData = {
    daemon: {
      running: daemonRunning,
      pid: daemonPid,
    },
    waitingSessions: waitingSessions.map((s) => {
      const waitMs = getWaitMs(s);
      const nextResume = s.resetAt
        ? new Date(new Date(s.resetAt).getTime() + (s.bufferSeconds ?? 120) * 1000)
        : null;
      return {
        id: s.id,
        provider: s.provider,
        cwd: s.cwd,
        attempts: s.attempts,
        resetAt: s.resetAt,
        nextResumeAt: nextResume ? nextResume.toISOString() : null,
        secondsLeft: waitMs > 0 ? Math.ceil(waitMs / 1000) : 0,
      };
    }),
  };

  if (options.json) {
    console.log(JSON.stringify(statusData, null, 2));
    return;
  }

  console.log(chalk.bold("--- agent-auto-resume status ---"));
  if (daemonRunning) {
    console.log(`Daemon Status: ${chalk.green("RUNNING")} (PID: ${daemonPid})`);
  } else {
    console.log(`Daemon Status: ${chalk.red("STOPPED")}`);
  }

  console.log(`\nWaiting Sessions (${waitingSessions.length}):`);
  if (waitingSessions.length === 0) {
    console.log("  No waiting sessions.");
  } else {
    for (const s of statusData.waitingSessions) {
      console.log(`\n  Session ID: ${chalk.cyan(s.id)} [${s.provider}]`);
      console.log(`    CWD: ${s.cwd}`);
      console.log(`    Attempts: ${s.attempts}`);
      if (s.resetAt) {
        console.log(`    Limit reset time: ${new Date(s.resetAt).toLocaleString()}`);
        console.log(`    Auto-resume scheduled: ${s.nextResumeAt ? new Date(s.nextResumeAt).toLocaleString() : "Unknown"}`);
        console.log(`    Time remaining: ${s.secondsLeft > 0 ? `${s.secondsLeft}s` : "Ready to resume"}`);
      } else {
        console.log(`    ${chalk.yellow("Warning: Reset time unknown. Auto-resume will not happen automatically.")}`);
      }
    }
  }
}
