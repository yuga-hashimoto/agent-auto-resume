import { getProvider } from "../providers/index.js";
import { ProviderName, LimitDetection } from "./types.js";

export function detectLimit(output: string, providerName?: ProviderName): LimitDetection {
  if (providerName) {
    try {
      const provider = getProvider(providerName);
      return provider.detectLimit(output);
    } catch {
      // ignore and fallback to checking all
    }
  }

  const allProviders: ProviderName[] = ["claude", "codex", "antigravity"];
  for (const name of allProviders) {
    const provider = getProvider(name);
    const detection = provider.detectLimit(output);
    if (detection.matched) {
      return detection;
    }
  }

  return { matched: false, provider: providerName || "claude" };
}
