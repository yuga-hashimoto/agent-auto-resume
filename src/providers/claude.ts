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
        let text: string | undefined;

        // Claude Code Mac app 形式:
        // { error: "rate_limit", apiErrorStatus: 429,
        //   message: { content: [{ type: "text", text: "You've hit your session limit · resets 4:20am (Asia/Tokyo)" }] } }
        if (data.error === "rate_limit" || data.apiErrorStatus === 429 || data.isApiErrorMessage) {
          // message.content 配列からテキスト抽出
          if (data.message && Array.isArray(data.message.content)) {
            for (const block of data.message.content) {
              if (block.type === "text" && typeof block.text === "string") {
                text = block.text;
                break;
              }
            }
          }
          // message.content が文字列の場合
          if (!text && data.message && typeof data.message.content === "string") {
            text = data.message.content;
          }
          // error フィールド自体にメッセージがある場合
          if (!text && typeof data.error === "string" && data.error !== "rate_limit") {
            text = data.error;
          }
        }

        // 通常のメッセージ形式 (CLI出力形式)
        if (!text) {
          text = data.text || data.content;
          if (!text && data.message && typeof data.message === "string") {
            text = data.message;
          }
          if (!text && data.input && typeof data.input === "object") {
            text = data.input.text;
          }
          if (!text && data.output && typeof data.output === "object") {
            text = data.output.text;
          }
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
