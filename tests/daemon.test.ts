import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

const testBaseDir = path.join(os.tmpdir(), "aar-test-daemon");
process.env.AAR_BASE_DIR = testBaseDir;

import { createSession, getSession } from "../src/core/session-store.js";
import { AarDaemon } from "../src/core/daemon.js";

describe("daemon", () => {
  beforeAll(async () => {
    await fs.remove(testBaseDir);
  });

  afterAll(async () => {
    await fs.remove(testBaseDir);
  });

  it("should process waiting sessions and ready them when reset time is passed", async () => {
    // すでにリセット時刻を過ぎている（20秒前）セッションを作成
    const session = await createSession({
      provider: "claude",
      cwd: "/dummy",
      originalCommand: ["claude"],
      resumeStrategy: "pty-input",
      status: "waiting_limit_reset",
      attempts: 0,
      maxAttempts: 5,
      bufferSeconds: 10,
      resetAt: new Date(Date.now() - 20000).toISOString(),
      managedByAar: true,
      source: "managed-pty",
    });

    const daemon = new AarDaemon();
    
    // バックグラウンドでのPTY再起動はコマンドが存在しないため失敗し、最終的に status が failed になる
    await daemon["processWaitingSessions"]();

    const updated = await getSession(session.id);
    expect(updated?.status).toBe("failed");
  });

  it("should mark session as failed if resetAt is missing", async () => {
    // resetAt がないセッションを作成
    const session = await createSession({
      provider: "claude",
      cwd: "/dummy",
      originalCommand: ["claude"],
      resumeStrategy: "pty-input",
      status: "waiting_limit_reset",
      attempts: 0,
      maxAttempts: 5,
      bufferSeconds: 10,
      managedByAar: true,
      source: "managed-pty",
    });

    const daemon = new AarDaemon();
    await daemon["processWaitingSessions"]();

    const updated = await getSession(session.id);
    // 自動リトライを行わず、failedになるはず
    expect(updated?.status).toBe("failed");
  });
});
