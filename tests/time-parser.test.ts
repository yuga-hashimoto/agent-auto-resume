import { describe, it, expect } from "vitest";
import { parseTimeString } from "../src/core/time-parser.js";

describe("time-parser", () => {
  const refDate = new Date("2026-06-06T12:00:00Z");

  it("should parse retry_after seconds", () => {
    const d1 = parseTimeString("retry_after: 3600", refDate);
    expect(d1?.getTime()).toBe(refDate.getTime() + 3600 * 1000);

    const d2 = parseTimeString('"retry_after": 3600', refDate);
    expect(d2?.getTime()).toBe(refDate.getTime() + 3600 * 1000);

    const d3 = parseTimeString("retry after 3600 seconds", refDate);
    expect(d3?.getTime()).toBe(refDate.getTime() + 3600 * 1000);
  });

  it("should parse ISO8601 date time", () => {
    const d = parseTimeString("2026-06-06T15:00:00+09:00", refDate);
    expect(d?.toISOString()).toBe("2026-06-06T06:00:00.000Z");
  });

  it("should parse date string without timezone", () => {
    const d = parseTimeString("2026-06-06 15:00", refDate);
    expect(d).toBeDefined();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5); // June is 5
    expect(d?.getDate()).toBe(6);
    expect(d?.getHours()).toBe(15);
    expect(d?.getMinutes()).toBe(0);
  });

  it("should parse relative times and handle past times", () => {
    // refDate: 2026-06-06 12:00 LocalTime (6月6日12時) とする
    const localRef = new Date(2026, 5, 6, 12, 0, 0);

    // 6:34 AM は12:00より過去なので、翌日の6月7日 6:34 AM になるはず
    const d = parseTimeString("try again at 6:34 AM", localRef);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(7);
    expect(d?.getHours()).toBe(6);
    expect(d?.getMinutes()).toBe(34);
  });

  it("should parse PM times", () => {
    const localRef = new Date(2026, 5, 6, 12, 0, 0);

    // 3pm は 15:00。12:00より未来なので今日の6月6日 15:00 になるはず
    const d = parseTimeString("resets at 3pm", localRef);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(5);
    expect(d?.getDate()).toBe(6);
    expect(d?.getHours()).toBe(15);
    expect(d?.getMinutes()).toBe(0);
  });

  it("should parse 'Resets in XhYmZs' duration format (Antigravity)", () => {
    // Resets in 157h20m8s → 157時間20分8秒後
    const d1 = parseTimeString(
      "RESOURCE_EXHAUSTED (code 429): Individual quota reached. Resets in 157h20m8s.",
      refDate
    );
    expect(d1).toBeDefined();
    const expected1 = refDate.getTime() + (157 * 3600 + 20 * 60 + 8) * 1000;
    expect(d1?.getTime()).toBe(expected1);

    // Resets in 22m49s → 22分49秒後
    const d2 = parseTimeString(
      "RESOURCE_EXHAUSTED (code 429): exhausted your capacity. Resets in 22m49s.",
      refDate
    );
    expect(d2).toBeDefined();
    const expected2 = refDate.getTime() + (22 * 60 + 49) * 1000;
    expect(d2?.getTime()).toBe(expected2);

    // "Your quota will reset after 1s" → 1秒後
    const d3 = parseTimeString(
      "RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity. Your quota will reset after 1s.",
      refDate
    );
    expect(d3).toBeDefined();
    const expected3 = refDate.getTime() + 1 * 1000;
    expect(d3?.getTime()).toBe(expected3);

    // "Resets in 0s" → 1分後に設定される
    const d4 = parseTimeString(
      "RESOURCE_EXHAUSTED (code 429): exhausted your capacity. Resets in 0s.",
      refDate
    );
    expect(d4).toBeDefined();
    const expected4 = refDate.getTime() + 60_000;
    expect(d4?.getTime()).toBe(expected4);
  });

  it("should return undefined for invalid strings", () => {
    const d = parseTimeString("just some random text", refDate);
    expect(d).toBeUndefined();
  });
});
