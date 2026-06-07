import { getProvider } from "../providers/index.js";
import { ProviderName, LimitDetection } from "./types.js";

export function detectLimit(output: string, providerName?: ProviderName, referenceDate?: Date): LimitDetection {
  if (providerName) {
    try {
      const provider = getProvider(providerName);
      return provider.detectLimit(output, referenceDate);
    } catch {
      // ignore and fallback to checking all
    }
  }

  const allProviders: ProviderName[] = ["claude", "codex", "antigravity"];
  for (const name of allProviders) {
    const provider = getProvider(name);
    const detection = provider.detectLimit(output, referenceDate);
    if (detection.matched) {
      return detection;
    }
  }

  return { matched: false, provider: providerName || "claude" };
}
