import os from "os";
import path from "path";
import fs from "fs-extra";
import { nanoid } from "nanoid";
import { SessionState, SessionStatus, AarConfig } from "./types.js";

const DEFAULT_BASE_DIR = path.join(os.homedir(), ".agent-auto-resume");
export const getBaseDir = () => process.env.AAR_BASE_DIR || DEFAULT_BASE_DIR;
export const getSessionsDir = () => path.join(getBaseDir(), "sessions");
export const getEventsDir = () => path.join(getBaseDir(), "events");
export const getShimsDir = () => path.join(getBaseDir(), "shims");
export const getConfigFile = () => path.join(getBaseDir(), "config.json");

export const BASE_DIR = getBaseDir();
export const SESSIONS_DIR = getSessionsDir();
export const EVENTS_DIR = getEventsDir();
export const SHIMS_DIR = getShimsDir();
export const CONFIG_FILE = getConfigFile();

export function resolveHome(filepath: string): string {
  if (filepath.startsWith("~")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export async function ensureDirs() {
  await fs.ensureDir(getBaseDir());
  await fs.ensureDir(getSessionsDir());
  await fs.ensureDir(getEventsDir());
  await fs.ensureDir(getShimsDir());
}

export const DEFAULT_CONFIG: AarConfig = {
  version: 1,
  bufferSeconds: 120,
  maxAttempts: 5,
  providers: {
    claude: {
      enabled: true,
      command: "claude",
      watchTranscripts: true,
      transcriptDirs: ["~/.claude/projects"],
    },
    codex: {
      enabled: true,
      command: "codex",
      watchTranscripts: true,
      transcriptDirs: ["~/.codex/sessions"],
    },
    antigravity: {
      enabled: true,
      command: "agy",
      experimental: true,
      watchTranscripts: true,
      transcriptDirs: ["~/.gemini/antigravity/brain", "~/.gemini/antigravity-cli/brain"],
    },
  },
  tmux: {
    enabled: false,
    pollIntervalMs: 5000,
  },
  daemon: {
    pollIntervalMs: 5000,
  },
};

export async function loadConfig(): Promise<AarConfig> {
  await ensureDirs();
  if (await fs.pathExists(getConfigFile())) {
    try {
      const data = await fs.readJson(getConfigFile());
      // 深いマージを簡易的に行う
      return {
        ...DEFAULT_CONFIG,
        ...data,
        providers: {
          claude: { ...DEFAULT_CONFIG.providers.claude, ...data.providers?.claude },
          codex: { ...DEFAULT_CONFIG.providers.codex, ...data.providers?.codex },
          antigravity: { ...DEFAULT_CONFIG.providers.antigravity, ...data.providers?.antigravity },
        },
        tmux: { ...DEFAULT_CONFIG.tmux, ...data.tmux },
        daemon: { ...DEFAULT_CONFIG.daemon, ...data.daemon },
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  await fs.writeJson(getConfigFile(), DEFAULT_CONFIG, { spaces: 2 });
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: AarConfig): Promise<void> {
  await ensureDirs();
  await fs.writeJson(getConfigFile(), config, { spaces: 2 });
}

export async function createSession(
  state: Omit<SessionState, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<SessionState> {
  await ensureDirs();
  const id = state.id || nanoid(10);
  const now = new Date().toISOString();
  const session: SessionState = {
    ...state,
    id,
    createdAt: now,
    updatedAt: now,
  };
  const sessionPath = path.join(getSessionsDir(), `${id}.json`);
  await fs.writeJson(sessionPath, session, { spaces: 2 });
  return session;
}

export async function updateSession(id: string, updates: Partial<SessionState>): Promise<SessionState> {
  await ensureDirs();
  const session = await getSession(id);
  if (!session) {
    throw new Error(`Session ${id} not found`);
  }
  const updated: SessionState = {
    ...session,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const sessionPath = path.join(getSessionsDir(), `${id}.json`);
  await fs.writeJson(sessionPath, updated, { spaces: 2 });
  return updated;
}

export async function getSession(id: string): Promise<SessionState | undefined> {
  await ensureDirs();
  const sessionPath = path.join(getSessionsDir(), `${id}.json`);
  if (!(await fs.pathExists(sessionPath))) {
    return undefined;
  }
  try {
    return await fs.readJson(sessionPath);
  } catch {
    return undefined;
  }
}

export async function listSessions(): Promise<SessionState[]> {
  await ensureDirs();
  const files = await fs.readdir(getSessionsDir());
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const sessions: SessionState[] = [];
  for (const file of jsonFiles) {
    try {
      const session = await fs.readJson(path.join(getSessionsDir(), file));
      sessions.push(session);
    } catch {
      // 破損ファイルは無視
    }
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLastSession(): Promise<SessionState | undefined> {
  const sessions = await listSessions();
  return sessions[0];
}

export async function getRecoverableSessions(): Promise<SessionState[]> {
  const sessions = await listSessions();
  const recoverableStatuses: SessionStatus[] = ["waiting_limit_reset", "ready_to_resume", "failed", "resuming"];
  return sessions.filter((s) => recoverableStatuses.includes(s.status));
}

export async function getWaitingSessions(): Promise<SessionState[]> {
  const sessions = await listSessions();
  return sessions.filter((s) => s.status === "waiting_limit_reset");
}

export async function deleteSession(id: string): Promise<void> {
  await ensureDirs();
  const sessionPath = path.join(getSessionsDir(), `${id}.json`);
  if (await fs.pathExists(sessionPath)) {
    await fs.remove(sessionPath);
  }
}
