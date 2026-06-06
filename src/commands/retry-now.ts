import { getSession, getLastSession, updateSession } from "../core/session-store.js";
import { getWaitMs } from "../core/scheduler.js";
import { resumeSessionInBackground } from "../core/process-manager.js";
import chalk from "chalk";

export async function runRetryNow(options: { id?: string; last?: boolean; force?: boolean }) {
  let session;

  if (options.id) {
    session = await getSession(options.id);
    if (!session) {
      console.error(chalk.red(`Error: Session with ID ${options.id} not found.`));
      process.exit(1);
    }
  } else if (options.last) {
    session = await getLastSession();
    if (!session) {
      console.error(chalk.red("Error: No sessions found."));
      process.exit(1);
    }
  } else {
    console.error(chalk.red("Error: Must specify either --id <session-id> or --last."));
    process.exit(1);
  }

  const waitMs = getWaitMs(session);
  if (waitMs > 0 && !options.force) {
    const secondsLeft = Math.ceil(waitMs / 1000);
    console.log(chalk.yellow(`Warning: Limit reset time has not yet passed for session ${session.id}.`));
    console.log(`Time remaining: ${secondsLeft} seconds.`);
    console.log("Run with '--force' to retry immediately (not recommended).");
    return;
  }

  console.log(`Starting immediate retry for session ${chalk.cyan(session.id)}...`);
  await updateSession(session.id, {
    status: "ready_to_resume",
  });

  const success = await resumeSessionInBackground(session);
  if (success) {
    console.log(chalk.green(`✓ Session ${session.id} resumed and completed successfully.`));
  } else {
    console.log(chalk.red(`✗ Retry failed or hit limit again.`));
  }
}
