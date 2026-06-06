import { ensureDirs, loadConfig } from "../core/session-store.js";
import { setupShell, ShellType, getSnippet } from "../core/shell-setup.js";
import { execSync } from "child_process";
import chalk from "chalk";

export interface SetupOptions {
  shell?: ShellType;
  noShellModify?: boolean;
  printShellSnippet?: boolean;
}

export async function runSetup(options: SetupOptions) {
  console.log(chalk.bold("Starting agent-auto-resume setup...\n"));

  await ensureDirs();
  console.log(chalk.green("✓ Initialized state directory at ~/.agent-auto-resume/"));

  await loadConfig();
  console.log(chalk.green("✓ Created configuration file config.json"));

  const providers = [
    { name: "Claude Code", cmd: "claude" },
    { name: "OpenAI Codex CLI", cmd: "codex" },
    { name: "Google Antigravity CLI", cmd: "agy" },
  ];

  console.log("\nChecking provider CLI commands:");
  for (const p of providers) {
    try {
      execSync(`which ${p.cmd}`, { stdio: "ignore" });
      console.log(chalk.green(`  ✓ ${p.name} (${p.cmd}) is installed.`));
    } catch {
      console.log(chalk.yellow(`  ⚠ ${p.name} (${p.cmd}) was not found in your PATH.`));
    }
  }

  if (options.printShellSnippet) {
    const shell = options.shell || "zsh";
    console.log(`\n--- Shell Snippet for ${shell} ---`);
    console.log(getSnippet(shell));
    console.log("---------------------------------");
    return;
  }

  console.log("");
  const resultMessage = await setupShell(options.shell, options.noShellModify);
  console.log(resultMessage);
}
