import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

const testBaseDir = path.join(os.tmpdir(), "aar-test-shell");
process.env.AAR_BASE_DIR = testBaseDir;

import { setupShell, getSnippet } from "../src/core/shell-setup.js";

describe("shell-setup", () => {
  beforeAll(async () => {
    await fs.remove(testBaseDir);
  });

  afterAll(async () => {
    await fs.remove(testBaseDir);
  });

  it("should generate snippet correctly", () => {
    const zshSnippet = getSnippet("zsh");
    expect(zshSnippet).toContain('claude() { aar managed claude -- claude "$@"; }');

    const fishSnippet = getSnippet("fish");
    expect(fishSnippet).toContain("function claude");
  });

  it("should not modify files if no-shell-modify is passed", async () => {
    const result = await setupShell("zsh", true);
    expect(result).toContain("Please manually append");
  });
});
