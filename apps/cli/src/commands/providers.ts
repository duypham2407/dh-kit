import { loginProvider, logoutProvider, redactProviderSecrets } from "../../../../packages/providers/src/auth/provider-auth-service.js";
import { loadProviderRegistry } from "../../../../packages/providers/src/config/provider-config-loader.js";
import type { ProviderLoginReport, ProviderLogoutReport, ProviderRegistryReport, ProviderVerifyReport } from "../../../../packages/shared/src/types/provider.js";

type ProvidersDeps = {
  listProviders: (repoRoot: string) => Promise<ProviderRegistryReport>;
  loginProvider: (repoRoot: string, input: { providerId: string; apiKey?: string; apiKeyEnv?: string }) => ProviderLoginReport;
  logoutProvider: (repoRoot: string, providerId: string) => ProviderLogoutReport;
  verifyProvider: (repoRoot: string, input: { providerId: string; modelId?: string }) => Promise<ProviderVerifyReport>;
};

const defaultDeps: ProvidersDeps = {
  listProviders: loadProviderRegistry,
  loginProvider,
  logoutProvider,
  verifyProvider: async (repoRoot, input) => ({
    providerId: input.providerId,
    ok: false,
    reason: "missing_credential",
    message: "provider verification is unavailable",
  }),
};

export async function runProvidersCommand(
  args: string[],
  repoRoot: string,
  deps: ProvidersDeps = defaultDeps,
): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "login") return runLogin(rest, repoRoot, deps);
    if (subcommand === "logout") return runLogout(rest, repoRoot, deps);
    if (subcommand === "verify") return runVerify(rest, repoRoot, deps);
    throw new Error(`Unknown providers command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${String(redactProviderSecrets((error as Error).message))}\n`);
    return 1;
  }
}

async function runList(args: string[], repoRoot: string, deps: ProvidersDeps): Promise<number> {
  const report = await deps.listProviders(repoRoot);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderProviders(report)}\n`);
  return 0;
}

function runLogin(args: string[], repoRoot: string, deps: ProvidersDeps): number {
  const providerId = positionalArgs(args, new Set(["--api-key-env", "--api-key"]))[0];
  if (!providerId) throw new Error("dh providers login requires <provider>.");
  const report = deps.loginProvider(repoRoot, {
    providerId,
    apiKeyEnv: readFlag(args, "--api-key-env"),
    apiKey: readFlag(args, "--api-key"),
  });
  const source = report.credentialSource ? ` ${report.credentialSource}` : "";
  process.stdout.write(`provider credential: ${report.providerId} ${report.credentialStatus}${source}\n`);
  return 0;
}

function runLogout(args: string[], repoRoot: string, deps: ProvidersDeps): number {
  const providerId = positionalArgs(args, new Set())[0];
  if (!providerId) throw new Error("dh providers logout requires <provider>.");
  deps.logoutProvider(repoRoot, providerId);
  process.stdout.write(`removed provider credential: ${providerId}\n`);
  return 0;
}

async function runVerify(args: string[], repoRoot: string, deps: ProvidersDeps): Promise<number> {
  const providerId = positionalArgs(args, new Set(["--model"]))[0];
  if (!providerId) throw new Error("dh providers verify requires <provider>.");
  const report = await deps.verifyProvider(repoRoot, { providerId, modelId: readFlag(args, "--model") });
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${report.message}\n`);
  return report.ok ? 0 : 1;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function positionalArgs(args: string[], valueFlags: Set<string>): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) values.push(arg);
  }
  return values;
}

function renderProviders(report: ProviderRegistryReport): string {
  if (report.providers.length === 0) return "no providers";
  return report.providers
    .map((provider) => {
      const runtime = provider.runtimeAvailable ? "available" : `unavailable:${provider.unavailableReason ?? "unknown"}`;
      const source = provider.credentialSource ? ` (${provider.credentialSource})` : "";
      return `${provider.providerId}  ${provider.name}  credential=${provider.credentialStatus}${source}  models=${provider.modelCount}  runtime=${runtime}`;
    })
    .join("\n");
}
