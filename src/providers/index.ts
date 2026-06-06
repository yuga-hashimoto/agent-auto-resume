import { claudeProvider } from "./claude.js";
import { codexProvider } from "./codex.js";
import { antigravityProvider } from "./antigravity.js";

export const providers = {
  claude: claudeProvider,
  codex: codexProvider,
  antigravity: antigravityProvider,
} as const;

export function getProvider(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === "agy" || normalized === "antigravity") {
    return antigravityProvider;
  }
  if (normalized === "claude") {
    return claudeProvider;
  }
  if (normalized === "codex") {
    return codexProvider;
  }

  throw new Error(`Unsupported provider: ${name}`);
}
