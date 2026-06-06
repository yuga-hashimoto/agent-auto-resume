import { execSync } from "child_process";
import os from "os";
import path from "path";
import { AgentProvider, LimitDetection, SessionState } from "../core/types.js";
import { parseTimeString } from "../core/time-parser.js";
import { ANTIGRAVITY_SAFE_RESUME_PROMPT } from "../prompts/safe-resume.js";

export const antigravityProvider: AgentProvider = {
  name: "antigravity",
  displayName: "Google Antigravity",
  defaultCommand: ["agy"],

  detectLimit(output: string): LimitDetection {
    const lines = output.split(/\r?\n/);
    const patterns = [
      /usage limit reached/i,
      /rate limit reached/i,
      /quota exceeded/i,
      /quota exhausted/i,
      /daily limit reached/i,
      /5-hour limit reached/i,
      /reached your Antigravity limit/i,
      /Antigravity usage limit reached/i,
      /try again at/i,
      /reset at/i,
      /resets at/i,
      /resets_at/i,
      /resets in/i,
      /retry after/i,
      /retry_after/i,
      /resource_exhausted/i,
      /exhausted your capacity/i,
      /Individual quota reached/i,
      /code 429/i,
    ];

    for (const line of lines) {
      const matched = patterns.some((p) => p.test(line));
      if (matched) {
        const resetAt = parseTimeString(line);
        return {
          matched: true,
          provider: "antigravity",
          reason: line.trim(),
          resetAt,
          raw: line,
        };
      }
    }

    return { matched: false, provider: "antigravity" };
  },

  async getResumeCommand(state: SessionState): Promise<string[]> {
    let helpOutput = "";
    try {
      helpOutput = execSync("agy --help", {
        cwd: state.cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      // agyコマンドが使えない、またはエラーの場合は helpOutput が空になる
    }

    if (helpOutput) {
      // 優先順位: agy resume --last -> agy continue -> agy c -> agy conversation --last -> fallback: agy
      if (helpOutput.includes("resume") && helpOutput.includes("--last")) {
        return ["agy", "resume", "--last"];
      }
      if (helpOutput.includes("continue")) {
        return ["agy", "continue"];
      }
      
      const lines = helpOutput.split("\n");
      const hasC = lines.some((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith("c ") || trimmed.startsWith("c\t");
      });
      if (hasC) {
        return ["agy", "c"];
      }

      if (helpOutput.includes("conversation") && helpOutput.includes("--last")) {
        return ["agy", "conversation", "--last"];
      }
    }

    return ["agy"];
  },

  getResumeInput(state: SessionState): string | undefined {
    if (state.resumeCommand && state.resumeCommand.length === 1 && state.resumeCommand[0] === "agy") {
      return ANTIGRAVITY_SAFE_RESUME_PROMPT.trim() + "\n";
    }
    return undefined;
  },

  getTranscriptDirs(): string[] {
    const home = os.homedir();
    return [
      // Antigravity Mac App のトランスクリプトディレクトリ
      path.join(home, ".gemini", "antigravity", "brain"),
      // Antigravity CLI のトランスクリプトディレクトリ
      path.join(home, ".gemini", "antigravity-cli", "brain"),
    ];
  },

  parseTranscriptEvent(line: string) {
    try {
      const data = JSON.parse(line);
      if (data && typeof data === "object") {
        let text: string | undefined;

        // Antigravity Mac App のエラー形式:
        // { type: "ERROR_MESSAGE", source: "SYSTEM",
        //   error: "RESOURCE_EXHAUSTED (code 429): Individual quota reached. ... Resets in 157h20m8s." }
        if (data.type === "ERROR_MESSAGE" && typeof data.error === "string") {
          text = data.error;
        }

        // ERROR_MESSAGE 以外はスキップ (PLANNER_RESPONSE の content にソースコードが
        // 含まれることがあり偽陽性の原因になるため)
        if (!text) {
          return undefined;
        }

        return {
          text,
          cwd: undefined, // Antigravityトランスクリプトにはcwdフィールドがない
          sessionId: undefined,
          timestamp: typeof data.created_at === "string" ? data.created_at : undefined,
        };
      }
    } catch {
      // JSONパースエラーは無視
    }
    return undefined;
  },
};

