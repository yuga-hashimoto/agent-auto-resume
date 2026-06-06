import { runManaged } from "./managed.js";

export async function runGeneric(options: { provider?: string }, args: string[]) {
  if (!options.provider) {
    console.error("Provider must be specified via --provider <provider>");
    process.exit(1);
  }
  await runManaged(options.provider, args);
}
