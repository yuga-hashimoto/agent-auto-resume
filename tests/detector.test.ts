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

  it("should detect Codex limits", () => {
    const o1 = detectLimit("usage limit reached, try again at 6:34 AM", "codex");
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("codex");

    const o2 = detectLimit('{"error":"usage_limit_reached","resets_at":"2026-06-06T15:00:00+09:00"}', "codex");
    expect(o2.matched).toBe(true);
  });

  it("should detect Antigravity limits", () => {
    const o1 = detectLimit("You have reached your Antigravity limit", "antigravity");
    expect(o1.matched).toBe(true);
    expect(o1.provider).toBe("antigravity");

    const o2 = detectLimit('{"error":"usage_limit_reached","retry_after":3600}', "antigravity");
    expect(o2.matched).toBe(true);
    expect(o2.resetAt).toBeDefined();
  });

  it("should not match plain 'limit'", () => {
    const o = detectLimit("There is a limit to everything.", "claude");
    expect(o.matched).toBe(false);
  });
});
