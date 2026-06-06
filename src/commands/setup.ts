import { ensureDirs, loadConfig } from "../core/session-store.js";
import { setupShell, ShellType, getSnippet } from "../core/shell-setup.js";
import { setupAutostart } from "../core/autostart.js";
import { execSync } from "child_process";
import chalk from "chalk";
import readline from "readline";

export interface SetupOptions {
  shell?: ShellType;
  noShellModify?: boolean;
  printShellSnippet?: boolean;
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
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

  if (options.noShellModify) {
    return;
  }

  console.log("");
  const autostartAns = await askQuestion(chalk.cyan("? Do you want aar daemon to start automatically when you log in? (y/N): "));
  if (autostartAns.toLowerCase().startsWith("y")) {
    try {
      const msg = await setupAutostart();
      console.log(chalk.green(`✓ ${msg}`));
    } catch (err: any) {
      console.error(chalk.red(`✗ Failed to setup autostart: ${err?.message}`));
    }
  } else {
    console.log(chalk.gray("Skipped automatic startup configuration. You can start the daemon manually using 'aar daemon start'."));
  }
}

