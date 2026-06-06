import { AgentProvider, LimitDetection, SessionState } from "../core/types.js";
import { parseTimeString } from "../core/time-parser.js";

export const claudeProvider: AgentProvider = {
  name: "claude",
  displayName: "Claude Code",
  defaultCommand: ["claude"],

  detectLimit(output: string): LimitDetection {
    const lines = output.split(/\r?\n/);
    const patterns = [
      /5-hour limit reached/i,
      /usage limit reached/i,
      /rate limit reached/i,
      /limit will reset at/i,
      /resource_exhausted/i,
      /exhausted your capacity/i,
      /code 429/i,
      /rate_limit_error/i,
      /rate limit exceeded/i,
      /exceeded your/i,
      /session limit/i,
      /hit your session limit/i,
    ];

    for (const line of lines) {
      const matched = patterns.some((p) => p.test(line));
      if (matched) {
        const resetAt = parseTimeString(line);
        return {
          matched: true,
          provider: "claude",
          reason: line.trim(),
          resetAt,
          raw: line,
        };
      }
    }

    return { matched: false, provider: "claude" };
  },

  getResumeCommand(state: SessionState): string[] {
    return ["claude", "--continue"];
  },

  getResumeInput(state: SessionState): string {
    return "continue\n";
  },

  getTranscriptDirs(): string[] {
    return ["~/.claude/projects"];
  },

  parseTranscriptEvent(line: string) {
    try {
      const data = JSON.parse(line);
      if (data && typeof data === "object") {
        // text フィールドは data.text や data.message, または data.input.text など
        let text = data.text || data.message || data.content;
        if (!text && data.input && typeof data.input === "object") {
          text = data.input.text;
        }
        if (!text && data.output && typeof data.output === "object") {
          text = data.output.text;
        }
        return {
          text: typeof text === "string" ? text : undefined,
          cwd: typeof data.cwd === "string" ? data.cwd : undefined,
          sessionId: typeof data.sessionId === "string" ? data.sessionId : (typeof data.uuid === "string" ? data.uuid : undefined),
          timestamp: typeof data.timestamp === "string" ? data.timestamp : (typeof data.createdAt === "string" ? data.createdAt : undefined),
        };
      }
    } catch {
      // JSONパースエラーは無視
    }
    return undefined;
  },
};
