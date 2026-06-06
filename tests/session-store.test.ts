import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

const testBaseDir = path.join(os.tmpdir(), "aar-test-sessions");
process.env.AAR_BASE_DIR = testBaseDir;

import {
  createSession,
  updateSession,
  getSession,
  listSessions,
  getRecoverableSessions,
  getWaitingSessions,
  deleteSession,
} from "../src/core/session-store.js";

describe("session-store", () => {
  beforeAll(async () => {
    await fs.remove(testBaseDir);
  });

  afterAll(async () => {
    await fs.remove(testBaseDir);
  });

  it("should CRUD sessions correctly", async () => {
    const s = await createSession({
      provider: "claude",
      cwd: "/test",
      originalCommand: ["claude"],
      resumeStrategy: "pty-input",
      status: "running",
      attempts: 0,
      maxAttempts: 5,
      bufferSeconds: 120,
      managedByAar: true,
      source: "managed-pty",
    });

    expect(s.id).toBeDefined();
    expect(s.status).toBe("running");

    const fetched = await getSession(s.id);
    expect(fetched?.id).toBe(s.id);

    const updated = await updateSession(s.id, { status: "waiting_limit_reset", resetAt: new Date().toISOString() });
    expect(updated.status).toBe("waiting_limit_reset");

    const list = await listSessions();
    expect(list.some((item) => item.id === s.id)).toBe(true);

    const waiting = await getWaitingSessions();
    expect(waiting.some((item) => item.id === s.id)).toBe(true);

    const recoverable = await getRecoverableSessions();
    expect(recoverable.some((item) => item.id === s.id)).toBe(true);

    await deleteSession(s.id);
    const deleted = await getSession(s.id);
    expect(deleted).toBeUndefined();
  });
});
