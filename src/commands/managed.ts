import { runInPty } from "../core/pty-runner.js";
import { ProviderName } from "../core/types.js";
import { getProvider } from "../providers/index.js";

export async function runManaged(providerNameStr: string, args: string[]) {
  let providerName: ProviderName;
  try {
    const prov = getProvider(providerNameStr);
    providerName = prov.name;
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  if (args.length === 0) {
    console.error("No command specified. Usage: aar managed <provider> -- <command...>");
    process.exit(1);
  }

  const command = args[0];
  const cmdArgs = args.slice(1);

  await runInPty({
    providerName,
    command,
    args: cmdArgs,
    cwd: process.cwd(),
  });
}
