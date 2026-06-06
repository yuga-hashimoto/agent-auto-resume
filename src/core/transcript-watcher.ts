import chokidar from "chokidar";
import path from "path";
import fs from "fs-extra";
import { loadConfig, resolveHome, createSession, listSessions, updateSession } from "./session-store.js";
import { logger } from "./logger.js";
import { getProvider } from "../providers/index.js";
import { detectLimit } from "./detector.js";
import { ProviderName } from "./types.js";

const fileCursors = new Map<string, number>();

export async function startTranscriptWatcher(abortSignal?: AbortSignal) {
  const config = await loadConfig();
  const watchers: chokidar.FSWatcher[] = [];

  const providersToWatch: ProviderName[] = ["claude", "codex"];

  for (const providerName of providersToWatch) {
    const providerConfig = config.providers[providerName];
    if (!providerConfig || !providerConfig.enabled || !providerConfig.watchTranscripts) {
      continue;
    }

    const provider = getProvider(providerName);
    if (!provider.parseTranscriptEvent || !provider.getTranscriptDirs) {
      continue;
    }

    const dirs = providerConfig.transcriptDirs.map(resolveHome);

    for (const dir of dirs) {
      if (!(await fs.pathExists(dir))) {
        logger.debug(`Transcript watch directory does not exist: ${dir}, skipping`, "aar");
        continue;
      }

      logger.info(`Starting transcript watcher for ${provider.displayName} at ${dir}`, "aar");
      const watcher = chokidar.watch(dir, {
        persistent: true,
        ignoreInitial: false,
      });

      watcher.on("add", (filePath) => handleFileChange(filePath, providerName));
      watcher.on("change", (filePath) => handleFileChange(filePath, providerName));
      watchers.push(watcher);
    }
  }

  abortSignal?.addEventListener("abort", () => {
    for (const w of watchers) {
      w.close();
    }
    logger.info("Transcript watchers stopped.", "aar");
  });
}

async function handleFileChange(filePath: string, providerName: ProviderName) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".json" && ext !== ".jsonl" && ext !== "") {
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    const startCursor = fileCursors.get(filePath) || 0;
    
    if (stat.size <= startCursor) {
      fileCursors.set(filePath, stat.size);
      return;
    }

    const fd = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(stat.size - startCursor);
    await fs.read(fd, buffer, 0, buffer.length, startCursor);
    await fs.close(fd);

    fileCursors.set(filePath, stat.size);

    const content = buffer.toString("utf-8");
    const lines = content.split(/\r?\n/);
    const provider = getProvider(providerName);

    for (const line of lines) {
      if (!line.trim()) continue;

      const event = provider.parseTranscriptEvent!(line);
      if (event && event.text) {
        const detection = detectLimit(event.text, providerName);
        if (detection.matched) {
          logger.warn(`Limit detected via transcript watcher in file ${filePath}: ${detection.reason}`, "aar");

          const sessions = await listSessions();
          const matchedSession = sessions.find(
            (s) =>
              s.status === "running" &&
              s.provider === providerName &&
              (event.cwd ? s.cwd === event.cwd : true)
          );

          const resetAtStr = detection.resetAt ? detection.resetAt.toISOString() : undefined;

          if (matchedSession) {
            if (matchedSession.status !== "waiting_limit_reset") {
              await updateSession(matchedSession.id, {
                status: "waiting_limit_reset",
                lastLimitDetectedAt: new Date().toISOString(),
                resetAt: resetAtStr,
                lastOutputSnippet: event.text.slice(-1000),
                transcriptPath: filePath,
              });
              logger.info(`Updated existing session ${matchedSession.id} to waiting_limit_reset`, "aar");
            }
          } else {
            const config = await loadConfig();
            const newSession = await createSession({
              provider: providerName,
              cwd: event.cwd || process.cwd(),
              originalCommand: provider.defaultCommand,
              resumeStrategy: providerName === "claude" ? "pty-input" : "command",
              status: "waiting_limit_reset",
              lastLimitDetectedAt: new Date().toISOString(),
              resetAt: resetAtStr,
              attempts: 0,
              maxAttempts: config.maxAttempts,
              bufferSeconds: config.bufferSeconds,
              lastOutputSnippet: event.text.slice(-1000),
              managedByAar: false,
              source: "transcript-watcher",
              transcriptPath: filePath,
            });
            logger.info(`Created new session ${newSession.id} via transcript-watcher`, "aar");
          }
        }
      }
    }
  } catch (err: any) {
    logger.debug(`Error reading transcript file ${filePath}: ${err.message}`, "aar");
  }
}
