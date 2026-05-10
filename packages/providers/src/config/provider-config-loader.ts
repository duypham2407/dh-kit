import fs from "node:fs";
import path from "node:path";
import type { Info } from "../../../shared/src/types/model.js";
import type { ProviderRegistryReport } from "../../../shared/src/types/provider.js";
import { OpencodeConfigSchema, type OpencodeConfig, type ProviderConfig } from "../../../shared/src/types/config-schema.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { resolveProviderCredential } from "../auth/provider-auth-service.js";
import { get as getModelsDev } from "../models-dev.js";

const SUPPORTED_SDKS = new Set([
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai-compatible",
  "@ai-sdk/google",
  "@ai-sdk/google-vertex",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/azure",
  "@ai-sdk/groq",
  "@ai-sdk/mistral",
  "@ai-sdk/xai",
  "@ai-sdk/deepinfra",
  "@openrouter/ai-sdk-provider",
]);

export type ProviderRuntimeConfig = ProviderConfig & {
  id: string;
  name: string;
  models: Record<string, unknown>;
  env: string[];
  npm?: string;
};

export async function loadProviderRegistry(
  repoRoot: string,
  input: { catalog?: Record<string, Info> } = {},
): Promise<ProviderRegistryReport> {
  const catalog = input.catalog ?? await getModelsDev();
  const config = loadProviderConfigFile(repoRoot);
  const overrides = new ConfigRepo(repoRoot).read<Record<string, ProviderConfig>>("provider.overrides") ?? {};
  const disabled = new Set(config.disabled_providers ?? []);
  const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined;

  const providerIds = new Set([...Object.keys(catalog), ...Object.keys(config.provider ?? {}), ...Object.keys(overrides)]);
  const providers = [...providerIds].sort().flatMap((providerId) => {
    if (disabled.has(providerId)) return [];
    if (enabled && !enabled.has(providerId)) return [];

    const runtime = resolveProviderRuntimeConfig(providerId, catalog, config.provider?.[providerId], overrides[providerId]);
    const credential = resolveProviderCredential(repoRoot, {
      providerId,
      env: runtime.env,
      configApiKey: runtime.options?.apiKey,
    });
    const runtimeAvailable = !runtime.npm || SUPPORTED_SDKS.has(runtime.npm);

    return [{
      providerId,
      name: runtime.name,
      enabled: true,
      credentialStatus: credential.status,
      credentialSource: credential.status === "env" ? credential.source : undefined,
      modelCount: Object.keys(runtime.models ?? {}).length,
      runtimeAvailable,
      unavailableReason: runtimeAvailable ? undefined : "unsupported_sdk" as const,
      npm: runtime.npm,
    }];
  });

  return { providers };
}

export async function loadProviderRuntimeConfig(
  repoRoot: string,
  providerId: string,
  input: { catalog?: Record<string, Info> } = {},
): Promise<ProviderRuntimeConfig> {
  const catalog = input.catalog ?? await getModelsDev();
  const config = loadProviderConfigFile(repoRoot);
  const overrides = new ConfigRepo(repoRoot).read<Record<string, ProviderConfig>>("provider.overrides") ?? {};
  return resolveProviderRuntimeConfig(providerId, catalog, config.provider?.[providerId], overrides[providerId]);
}

export function resolveProviderRuntimeConfig(
  providerId: string,
  catalog: Record<string, Info>,
  config?: ProviderConfig,
  override?: ProviderConfig,
): ProviderRuntimeConfig {
  const base = catalog[providerId] as ProviderConfig | undefined;
  const merged = mergeProviderConfig(base, config, override);
  return {
    ...merged,
    id: providerId,
    name: merged.name ?? providerId,
    env: merged.env ?? [],
    models: merged.models ?? {},
    npm: merged.npm ?? firstModelNpm(merged.models) ?? providerDefaultNpm(providerId),
  };
}

export function loadProviderConfigFile(repoRoot: string): OpencodeConfig {
  const configPath = path.join(repoRoot, "opencode.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return OpencodeConfigSchema.parse(JSON.parse(fs.readFileSync(configPath, "utf8")));
  } catch (error) {
    throw new Error(`Failed to parse opencode.json: ${(error as Error).message}`);
  }
}

function mergeProviderConfig(...configs: Array<ProviderConfig | undefined>): ProviderConfig {
  const merged: ProviderConfig = {};
  for (const item of configs) {
    if (!item) continue;
    Object.assign(merged, item);
    merged.options = { ...(merged.options ?? {}), ...(item.options ?? {}) };
    merged.models = { ...(merged.models ?? {}), ...(item.models ?? {}) };
  }
  return merged;
}

function firstModelNpm(models: ProviderConfig["models"]): string | undefined {
  const first = models ? Object.values(models)[0] : undefined;
  return first?.provider?.npm;
}

function providerDefaultNpm(providerId: string): string | undefined {
  const defaults: Record<string, string> = {
    openai: "@ai-sdk/openai",
    anthropic: "@ai-sdk/anthropic",
    google: "@ai-sdk/google",
    "google-vertex": "@ai-sdk/google-vertex",
    "amazon-bedrock": "@ai-sdk/amazon-bedrock",
    azure: "@ai-sdk/azure",
    groq: "@ai-sdk/groq",
    mistral: "@ai-sdk/mistral",
    xai: "@ai-sdk/xai",
    deepinfra: "@ai-sdk/deepinfra",
    openrouter: "@openrouter/ai-sdk-provider",
  };
  return defaults[providerId];
}
