import { AgentProvider, LimitDetection, SessionState } from "../core/types.js";
import { parseTimeString } from "../core/time-parser.js";
import { CODEX_SAFE_RESUME_PROMPT } from "../prompts/safe-resume.js";

export const codexProvider: AgentProvider = {
  name: "codex",
  displayName: "OpenAI Codex CLI",
  defaultCommand: ["codex"],

  detectLimit(output: string): LimitDetection {
    const lines = output.split(/\r?\n/);
    const patterns = [
      /usage limit reached/i,
      /rate limit reached/i,
      /try again at/i,
      /resets_at/i,
      /usage_limit_reached/i,
    ];

    for (const line of lines) {
      const matched = patterns.some((p) => p.test(line));
      if (matched) {
        const resetAt = parseTimeString(line);
        return {
          matched: true,
          provider: "codex",
          reason: line.trim(),
          resetAt,
          raw: line,
        };
      }
    }

    return { matched: false, provider: "codex" };
  },

  getResumeCommand(state: SessionState): string[] {
    return [
      "codex",
      "exec",
      "resume",
      "--last",
      CODEX_SAFE_RESUME_PROMPT.trim(),
    ];
  },

  getTranscriptDirs(): string[] {
    return ["~/.codex/sessions"];
  },

  parseTranscriptEvent(line: string) {
    try {
      const data = JSON.parse(line);
      if (data && typeof data === "object") {
        const text = data.text || data.message || data.content;
        return {
          text: typeof text === "string" ? text : undefined,
          cwd: typeof data.cwd === "string" ? data.cwd : undefined,
          sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
          timestamp: typeof data.timestamp === "string" ? data.timestamp : undefined,
        };
      }
    } catch {
      // ignore
    }
    return undefined;
  },
};
