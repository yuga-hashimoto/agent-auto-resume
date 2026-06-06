import { describe, it, expect } from "vitest";
import { detectLimit } from "../src/core/detector.js";

describe("detector", () => {
  it("should detect Claude Code limits", () => {
    const o1 = detectLimit("5-hour limit reached - resets 3pm", "claude");
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("claude");
    expect(o1.resetAt).toBeDefined();

    const o2 = detectLimit("usage limit reached, resets at 15:00", "claude");
    expect(o2.matched).toBe(true);

    const o3 = detectLimit("Claude usage limit reached. Your limit will reset at 2026-06-06T15:00:00+09:00", "claude");
    expect(o3.matched).toBe(true);
    expect(o3.resetAt).toBeDefined();
  });

  it("should detect Claude Code Mac app session limit", () => {
    // 実際のClaude Code Macアプリからのリミットメッセージ
    const o1 = detectLimit("You've hit your session limit · resets 4:20am (Asia/Tokyo)", "claude");
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("claude");
    expect(o1.resetAt).toBeDefined();

    const o2 = detectLimit("You've hit your session limit · resets 10:20pm (Asia/Tokyo)", "claude");
    expect(o2.matched).toBe(true);
    expect(o2.resetAt).toBeDefined();

    const o3 = detectLimit("You've hit your session limit · resets 2pm (Asia/Tokyo)", "claude");
    expect(o3.matched).toBe(true);
    expect(o3.resetAt).toBeDefined();
  });

  it("should detect Codex limits", () => {
    const o1 = detectLimit("usage limit reached, try again at 6:34 AM", "codex");
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("codex");

    const o2 = detectLimit('{"error":"usage_limit_reached","resets_at":"2026-06-06T15:00:00+09:00"}', "codex");
    expect(o2.matched).toBe(true);

    const o3 = detectLimit(
      "exit status: 1: You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 9:10 PM.",
      "codex"
    );
    expect(o3.matched).toBe(true);
    expect(o3.resetAt).toBeDefined();
  });

  it("should detect Antigravity limits", () => {
    const o1 = detectLimit("You have reached your Antigravity limit", "antigravity");
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("antigravity");

    const o2 = detectLimit('{"error":"usage_limit_reached","retry_after":3600}', "antigravity");
    expect(o2.matched).toBe(true);
    expect(o2.resetAt).toBeDefined();
  });

  it("should detect Antigravity Mac app RESOURCE_EXHAUSTED errors", () => {
    // 実際のAntigravity Macアプリからのリミットメッセージ
    const o1 = detectLimit(
      "RESOURCE_EXHAUSTED (code 429): Individual quota reached. Contact your administrator to enable overages. Resets in 157h20m8s.",
      "antigravity"
    );
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("antigravity");
    expect(o1.resetAt).toBeDefined();

    const o2 = detectLimit(
      "RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Resets in 22m49s.",
      "antigravity"
    );
    expect(o2.matched).toBe(true);
    expect(o2.resetAt).toBeDefined();

    const o3 = detectLimit(
      "RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Your quota will reset after 0s.",
      "antigravity"
    );
    expect(o3.matched).toBe(true);
    expect(o3.resetAt).toBeDefined();
  });

  it("should not match plain 'limit'", () => {
    const o = detectLimit("There is a limit to everything.", "claude");
    expect(o.matched).toBe(false);
  });
});
