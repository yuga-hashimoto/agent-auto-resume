import os from "os";
import path from "path";
import fs from "fs-extra";
import { resolveHome } from "./session-store.js";

export type ShellType = "zsh" | "bash" | "fish";

/**
 * ユーザーの環境変数等から現在のシェルを自動検出する。
 */
export function detectShell(): ShellType {
  const shellEnv = process.env.SHELL || "";
  if (shellEnv.includes("zsh")) {
    return "zsh";
  }
  if (shellEnv.includes("fish")) {
    return "fish";
  }
  return "bash";
}

/**
 * 各シェルのrcファイルへのパスを取得する。
 */
export function getShellRcPath(shell: ShellType): string {
  if (shell === "zsh") {
    return resolveHome("~/.zshrc");
  }
  if (shell === "fish") {
    return resolveHome("~/.config/fish/config.fish");
  }
  return resolveHome("~/.bashrc");
}

export const ZSH_BASH_SNIPPET = `
# agent-auto-resume
if command -v aar >/dev/null 2>&1; then
  claude() { aar managed claude -- claude "$@"; }
  codex() { aar managed codex -- codex "$@"; }
  agy() { aar managed antigravity -- agy "$@"; }
fi
`;

export const FISH_SNIPPET = `
# agent-auto-resume
function claude
  aar managed claude -- claude $argv
end

function codex
  aar managed codex -- codex $argv
end

function agy
  aar managed antigravity -- agy $argv
end
`;

/**
 * シェルに応じた設定スニペットを取得する。
 */
export function getSnippet(shell: ShellType): string {
  return shell === "fish" ? FISH_SNIPPET.trim() : ZSH_BASH_SNIPPET.trim();
}

/**
 * シェルのrcファイルに対して統合用関数のスニペットを追記・設定する。
 * @param shell 対象シェル。未指定の場合は自動検出する。
 * @param noModify 実際にrcファイルを変更せず、案内メッセージのみを取得する。
 */
export async function setupShell(shell?: ShellType, noModify = false): Promise<string> {
  const targetShell = shell || detectShell();
  const rcPath = getShellRcPath(targetShell);
  const snippet = getSnippet(targetShell);

  if (noModify) {
    return `Please manually append the following snippet to your shell config file (${rcPath}):\n\n${snippet}`;
  }

  await fs.ensureDir(path.dirname(rcPath));

  let exists = false;
  let content = "";
  if (await fs.pathExists(rcPath)) {
    content = await fs.readFile(rcPath, "utf-8");
    if (content.includes("agent-auto-resume") || content.includes("aar managed")) {
      exists = true;
    }
  }

  if (exists) {
    return `Shell integration snippet already exists in ${rcPath}. Skipping configuration.`;
  }

  const newContent = content ? `${content.trimEnd()}\n\n${snippet}\n` : `${snippet}\n`;
  await fs.writeFile(rcPath, newContent, "utf-8");
  return `Successfully updated shell configuration at ${rcPath}.\nRestart your terminal or run: source ${rcPath}`;
}
