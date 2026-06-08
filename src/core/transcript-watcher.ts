import chokidar from "chokidar";
import path from "path";
import fs from "fs-extra";
import { loadConfig, resolveHome, createSession, listSessions, updateSession } from "./session-store.js";
import { logger } from "./logger.js";
import { getProvider } from "../providers/index.js";
import { detectLimit } from "./detector.js";
import { ProviderName } from "./types.js";

const fileCursors = new Map<string, number>();

// 最近処理したリミット検知のデバウンス用 (同一プロバイダーで30秒以内の重複を防止)
const lastLimitDetectedAt = new Map<string, number>();
const LIMIT_DETECT_DEBOUNCE_MS = 30_000;

export async function startTranscriptWatcher(abortSignal?: AbortSignal) {
  const config = await loadConfig();
  const watchers: chokidar.FSWatcher[] = [];

  // antigravity もトランスクリプト監視対象に追加
  const providersToWatch: ProviderName[] = ["claude", "codex", "antigravity"];

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

      // Antigravity のトランスクリプトは深いネスト構造:
      // brain/<uuid>/.system_generated/logs/transcript.jsonl
      // Claude のトランスクリプトは浅い構造:
      // projects/<dir>/<uuid>.jsonl
      const watcher = chokidar.watch(dir, {
        persistent: true,
        ignoreInitial: true, // 初期ファイルはスキップ（既に処理済みのリミットを再検知しない）
        depth: 6, // Antigravityの深い構造に対応
        // .jsonl と .json ファイルのみ監視
        ignored: (filePath: string) => {
          const ext = path.extname(filePath).toLowerCase();
          // ディレクトリは通過させる
          try {
            if (fs.statSync(filePath).isDirectory()) return false;
          } catch {
            return false; // stat失敗時はスキップしない
          }
          return ext !== ".jsonl" && ext !== ".json";
        },
      });

      watcher.on("add", async (filePath) => {
        // 新しいファイル発見時: 既存内容はスキップし、カーソルを末尾にセット
        // これにより、過去のリミットメッセージを再検知しない
        try {
          const stat = await fs.stat(filePath);
          fileCursors.set(filePath, stat.size);
        } catch {
          fileCursors.set(filePath, 0);
        }
      });
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

function getSessionIdFromPath(filePath: string, providerName: ProviderName): string {
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);
  if (providerName === "claude") {
    return name;
  } else if (providerName === "codex") {
    if (name.startsWith("rollout-")) {
      return name.replace(/^rollout-/, "");
    }
    return name;
  } else if (providerName === "antigravity") {
    const parts = filePath.split(path.sep);
    const brainIdx = parts.lastIndexOf("brain");
    if (brainIdx !== -1 && parts.length > brainIdx + 1) {
      return parts[brainIdx + 1];
    }
  }
  return name;
}

async function inferAntigravityCwd(sessionDir: string): Promise<string | undefined> {
  const files = ["task.md", "walkthrough.md", "implementation_plan.md"];
  const pathRegex = /file:\/\/(\/[^\s#)"]+)/g;
  
  for (const file of files) {
    const filePath = path.join(sessionDir, file);
    if (await fs.pathExists(filePath)) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        let match;
        while ((match = pathRegex.exec(content)) !== null) {
          const fullPath = match[1];
          if (fullPath.includes("/.gemini/")) {
            continue;
          }
          const decodedPath = decodeURIComponent(fullPath);
          const parts = decodedPath.split("/");
          const githubIdx = parts.indexOf("GitHub");
          if (githubIdx !== -1 && parts.length > githubIdx + 1) {
            const repoRoot = parts.slice(0, githubIdx + 2).join("/");
            if (await fs.pathExists(repoRoot)) {
              return repoRoot;
            }
          }
          const dir = path.dirname(decodedPath);
          if (await fs.pathExists(dir)) {
            return dir;
          }
        }
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

async function inferCwdFromTranscript(filePath: string): Promise<string | undefined> {
  const pathRegex = /file:\/\/(\/[^\s#)"]+)/g;
  const absPathRegex = /"(\/(?:Volumes|Users)\/[^"]+)"/g;
  
  if (await fs.pathExists(filePath)) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      
      let match;
      while ((match = pathRegex.exec(content)) !== null) {
        const fullPath = match[1];
        if (fullPath.includes("/.gemini/") || fullPath.includes("/.claude/") || fullPath.includes("/.codex/")) {
          continue;
        }
        const decodedPath = decodeURIComponent(fullPath);
        const parts = decodedPath.split("/");
        const githubIdx = parts.indexOf("GitHub");
        if (githubIdx !== -1 && parts.length > githubIdx + 1) {
          const repoRoot = parts.slice(0, githubIdx + 2).join("/");
          if (await fs.pathExists(repoRoot)) {
            return repoRoot;
          }
        }
        const dir = path.dirname(decodedPath);
        if (await fs.pathExists(dir)) {
          return dir;
        }
      }
      
      pathRegex.lastIndex = 0; // reset
      while ((match = absPathRegex.exec(content)) !== null) {
        const fullPath = match[1];
        if (fullPath.includes("/.gemini/") || fullPath.includes("/.claude/") || fullPath.includes("/.codex/")) {
          continue;
        }
        const parts = fullPath.split("/");
        const githubIdx = parts.indexOf("GitHub");
        if (githubIdx !== -1 && parts.length > githubIdx + 1) {
          const repoRoot = parts.slice(0, githubIdx + 2).join("/");
          if (await fs.pathExists(repoRoot)) {
            return repoRoot;
          }
        }
        const dir = path.dirname(fullPath);
        if (await fs.pathExists(dir)) {
          return dir;
        }
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

async function handleFileChange(filePath: string, providerName: ProviderName) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".json" && ext !== ".jsonl") {
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

    const fileSessionId = getSessionIdFromPath(filePath, providerName);
    let derivedCwd: string | undefined = undefined;
    if (providerName === "antigravity") {
      const parts = filePath.split(path.sep);
      const brainIdx = parts.lastIndexOf("brain");
      if (brainIdx !== -1 && parts.length > brainIdx + 1) {
        const sessionDir = parts.slice(0, brainIdx + 2).join(path.sep);
        derivedCwd = await inferAntigravityCwd(sessionDir);
      }
    } else {
      derivedCwd = await inferCwdFromTranscript(filePath);
    }

    for (const line of lines) {
      if (!line.trim()) continue;

      const event = provider.parseTranscriptEvent!(line);
      if (event && event.text) {
        const refDate = event.timestamp ? new Date(event.timestamp) : undefined;
        const detection = detectLimit(event.text, providerName, refDate);
        if (detection.matched) {
          // デバウンス: 同じプロバイダーで短期間に連続検知を防止
          const now = Date.now();
          const lastDetect = lastLimitDetectedAt.get(providerName) || 0;
          if (now - lastDetect < LIMIT_DETECT_DEBOUNCE_MS) {
            logger.debug(`Skipping duplicate limit detection for ${providerName} (debounce)`, "aar");
            continue;
          }
          lastLimitDetectedAt.set(providerName, now);

          logger.warn(`Limit detected via transcript watcher in file ${filePath}: ${detection.reason}`, "aar");

          const sessions = await listSessions();

          const targetSessionId = (event as any).sessionId || fileSessionId;

          // 既に waiting_limit_reset のセッションがある場合は重複作成しない
          const existingWaiting = sessions.find(
            (s) =>
              s.status === "waiting_limit_reset" &&
              s.provider === providerName &&
              s.id === targetSessionId
          );
          if (existingWaiting) {
            logger.debug(`Already have a waiting session for ${providerName}: ${existingWaiting.id}, skipping`, "aar");
            // リセット時間が更新された場合はセッションを更新
            const resetAtStr = detection.resetAt ? detection.resetAt.toISOString() : new Date().toISOString();
            if (resetAtStr && resetAtStr !== existingWaiting.resetAt) {
              await updateSession(existingWaiting.id, {
                resetAt: resetAtStr,
                lastOutputSnippet: event.text.slice(-1000),
                transcriptPath: filePath,
              });
              logger.info(`Updated reset time for existing session ${existingWaiting.id}`, "aar");
            }
            continue;
          }

          const matchedSession = sessions.find(
            (s) =>
              s.provider === providerName &&
              s.id === targetSessionId
          );

          const resetAtStr = detection.resetAt ? detection.resetAt.toISOString() : new Date().toISOString();

          if (matchedSession) {
            if (matchedSession.status !== "waiting_limit_reset") {
              await updateSession(matchedSession.id, {
                status: "waiting_limit_reset",
                lastLimitDetectedAt: new Date().toISOString(),
                resetAt: resetAtStr,
                lastOutputSnippet: event.text.slice(-1000),
                transcriptPath: filePath,
                cwd: event.cwd || derivedCwd || matchedSession.cwd,
              });
              logger.info(`Updated existing session ${matchedSession.id} to waiting_limit_reset`, "aar");
            }
          } else {
            const config = await loadConfig();
            const newSession = await createSession({
              id: targetSessionId,
              provider: providerName,
              cwd: event.cwd || derivedCwd || process.cwd(),
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
