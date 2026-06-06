#!/usr/bin/env node

import { Command } from "commander";
import { runSetup } from "./commands/setup.js";
import { handleDaemon } from "./commands/daemon.js";
import { runManaged } from "./commands/managed.js";
import { runGeneric } from "./commands/run.js";
import { runStatus } from "./commands/status.js";
import { runSessions } from "./commands/sessions.js";
import { runRecover } from "./commands/recover.js";
import { runRetryNow } from "./commands/retry-now.js";

const program = new Command();

program
  .name("aar")
  .description("Daemon-based auto-resume CLI tool for Claude Code, Codex, and Antigravity")
  .version("0.1.0");

program
  .command("setup")
  .description("Setup state directories, configuration, and shell integration")
  .option("--shell <type>", "Specify shell type (zsh, bash, fish)")
  .option("--no-shell-modify", "Do not modify shell configuration files automatically")
  .option("--print-shell-snippet", "Only print the shell snippet to stdout")
  .action(runSetup);

program
  .command("daemon <action>")
  .description("Manage the agent-auto-resume daemon (actions: start, stop, restart, status, logs, run)")
  .option("--tmux", "Enable experimental tmux watcher")
  .action((action, options) => handleDaemon(action, options));

program
  .command("managed <provider>")
  .description("Run a CLI tool in managed mode under PTY")
  .argument("[command...]", "Command to execute (e.g. claude, codex, agy)")
  .action((provider, args) => runManaged(provider, args));

program
  .command("run")
  .description("Generic run command to wrap any agent CLI under a provider")
  .option("--provider <provider>", "Specify provider (claude, codex, antigravity)")
  .argument("[command...]", "Command to execute")
  .action((args, options) => {
    // '--' の後の引数は args として渡される
    runGeneric(options, args);
  });

program
  .command("status")
  .description("Show daemon status, waiting sessions, and next resume schedules")
  .option("--json", "Format output as JSON")
  .action(runStatus);

program
  .command("sessions")
  .description("List all saved sessions and their statuses")
  .option("--json", "Format output as JSON")
  .action(runSessions);

program
  .command("recover")
  .description("Manually recover waiting, failed, or cancelled sessions")
  .option("--last", "Recover the most recent session")
  .option("--id <session-id>", "Recover session by ID")
  .action(runRecover);

program
  .command("retry-now")
  .description("Retry waiting sessions immediately")
  .option("--id <session-id>", "Session ID to retry")
  .option("--last", "Retry the most recent waiting session")
  .option("--force", "Force retry even if reset time has not passed")
  .action(runRetryNow);

// One-shot wrapper commands
// これらはサブコマンド以下のすべてのオプションや引数をラップして managed mode に渡します。
program
  .command("claude")
  .description("One-shot wrapper to run Claude Code in managed mode")
  .allowUnknownOption()
  .action(() => {
    const idx = process.argv.indexOf("claude");
    const forwardedArgs = process.argv.slice(idx + 1);
    runManaged("claude", ["claude", ...forwardedArgs]);
  });

program
  .command("codex")
  .description("One-shot wrapper to run Codex CLI in managed mode")
  .allowUnknownOption()
  .action(() => {
    const idx = process.argv.indexOf("codex");
    const forwardedArgs = process.argv.slice(idx + 1);
    runManaged("codex", ["codex", ...forwardedArgs]);
  });

program
  .command("antigravity")
  .description("One-shot wrapper to run Antigravity CLI in managed mode")
  .allowUnknownOption()
  .action(() => {
    const idx = process.argv.indexOf("antigravity");
    const forwardedArgs = process.argv.slice(idx + 1);
    runManaged("antigravity", ["agy", ...forwardedArgs]);
  });

program
  .command("agy")
  .description("Alias for antigravity command")
  .allowUnknownOption()
  .action(() => {
    const idx = process.argv.indexOf("agy");
    const forwardedArgs = process.argv.slice(idx + 1);
    runManaged("antigravity", ["agy", ...forwardedArgs]);
  });

program.parse(process.argv);
