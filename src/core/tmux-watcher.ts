import { execSync } from "child_process";
import { loadConfig, createSession, listSessions, updateSession } from "./session-store.js";
import { logger } from "./logger.js";
import { detectLimit } from "./detector.js";
import { ProviderName } from "./types.js";
import { getProvider } from "../providers/index.js";

let tmuxTimer: NodeJS.Timeout | undefined;

export async function startTmuxWatcher(abortSignal?: AbortSignal) {
  const config = await loadConfig();
  if (!config.tmux.enabled) {
    return;
  }

  try {
    execSync("tmux -V", { stdio: "ignore" });
  } catch {
    logger.warn("tmux is enabled in config, but 'tmux' command was not found. tmux watcher is disabled.", "aar");
    return;
  }

  logger.info("Starting tmux watcher (experimental)...", "aar");

  const poll = async () => {
    if (abortSignal?.aborted) return;
    try {
      await checkTmuxPanes();
    } catch (err: any) {
      logger.debug(`Error checking tmux panes: ${err.message}`, "aar");
    }
    tmuxTimer = setTimeout(poll, config.tmux.pollIntervalMs || 5000);
  };

  poll();

  abortSignal?.addEventListener("abort", () => {
    if (tmuxTimer) clearTimeout(tmuxTimer);
    logger.info("Tmux watcher stopped.", "aar");
  });
}

async function checkTmuxPanes() {
  let listOutput = "";
  try {
    listOutput = execSync("tmux list-panes -a -F '#{pane_id}|#{pane_pid}|#{pane_current_path}|#{pane_current_command}'", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return;
  }

  const panes = listOutput.split("\n").filter(Boolean).map((line) => {
    const [paneId, panePid, paneCwd, paneCmd] = line.split("|");
    return { paneId, panePid, paneCwd, paneCmd };
  });

  const providers: { name: ProviderName; cmdKeywords: string[] }[] = [
    { name: "claude", cmdKeywords: ["claude", "claude-code"] },
    { name: "codex", cmdKeywords: ["codex"] },
    { name: "antigravity", cmdKeywords: ["agy", "antigravity"] },
  ];

  for (const pane of panes) {
    const matchedProvider = providers.find((p) =>
      p.cmdKeywords.some((keyword) => pane.paneCmd.toLowerCase().includes(keyword))
    );

    if (!matchedProvider) {
      continue;
    }

    let paneOutput = "";
    try {
      paneOutput = execSync(`tmux capture-pane -p -t ${pane.paneId}`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      continue;
    }

    const detection = detectLimit(paneOutput, matchedProvider.name);
    if (detection.matched) {
      const sessions = await listSessions();
      let matchedSession = sessions.find((s) => s.tmuxPaneId === pane.paneId && s.status === "waiting_limit_reset");

      const resetAtStr = detection.resetAt ? detection.resetAt.toISOString() : undefined;

      if (!matchedSession) {
        matchedSession = sessions.find((s) => s.tmuxPaneId === pane.paneId && s.status === "running");
        
        if (matchedSession) {
          await updateSession(matchedSession.id, {
            status: "waiting_limit_reset",
            lastLimitDetectedAt: new Date().toISOString(),
            resetAt: resetAtStr,
            lastOutputSnippet: paneOutput.slice(-1000),
          });
          logger.info(`Updated tmux session ${matchedSession.id} to waiting_limit_reset`, "aar");
        } else {
          const config = await loadConfig();
          const provider = getProvider(matchedProvider.name);
          const newSession = await createSession({
            provider: matchedProvider.name,
            cwd: pane.paneCwd || process.cwd(),
            originalCommand: provider.defaultCommand,
            resumeStrategy: "pty-input",
            status: "waiting_limit_reset",
            lastLimitDetectedAt: new Date().toISOString(),
            resetAt: resetAtStr,
            attempts: 0,
            maxAttempts: config.maxAttempts,
            bufferSeconds: config.bufferSeconds,
            lastOutputSnippet: paneOutput.slice(-1000),
            managedByAar: false,
            source: "tmux-watcher",
            tmuxPaneId: pane.paneId,
          });
          logger.info(`Created new session ${newSession.id} via tmux-watcher (pane: ${pane.paneId})`, "aar");
        }
      }
    }
  }
}

/**
 * tmux pane に対してキー入力を送信する。
 */
export function sendKeysToTmux(paneId: string, keys: string): boolean {
  try {
    // 改行コードなどを適切に解釈して送信
    execSync(`tmux send-keys -t ${paneId} "${keys.replace(/"/g, '\\"')}"`, { stdio: "ignore" });
    return true;
  } catch (err: any) {
    logger.error(`Failed to send keys to tmux pane ${paneId}: ${err.message}`, "aar");
    return false;
  }
}
