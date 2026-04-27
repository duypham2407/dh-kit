import type { ProviderRegistryEntry } from "../../../shared/src/types/model.js";
import { OpencodeConfigSchema } from "../../../shared/src/types/config-schema.js";
import fs from "node:fs";
import path from "node:path";

function loadConfig(repoRoot: string) {
  const configPath = path.join(repoRoot, "opencode.json");
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const json = JSON.parse(content);
    return OpencodeConfigSchema.parse(json);
  } catch (e) {
    return undefined;
  }
}

export function listProviders(repoRoot: string): ProviderRegistryEntry[] {
  const config = loadConfig(repoRoot);
  const providers: ProviderRegistryEntry[] = [];
  const addedIds = new Set<string>();

  if (config?.provider) {
    for (const [id, providerConfig] of Object.entries(config.provider)) {
      providers.push({
        providerId: id,
        displayName: providerConfig.name || id,
        enabled: true,
        supportsVariants: true,
      });
      addedIds.add(id);
    }
  }

  // Fallbacks using environment variables if not defined in config
  if (!addedIds.has("openai") && process.env.OPENAI_API_KEY) {
    providers.push({ providerId: "openai", displayName: "OpenAI", enabled: true, supportsVariants: true });
    addedIds.add("openai");
  }

  if (!addedIds.has("anthropic") && process.env.ANTHROPIC_API_KEY) {
    providers.push({ providerId: "anthropic", displayName: "Anthropic", enabled: true, supportsVariants: true });
    addedIds.add("anthropic");
  }
  
  if (providers.length === 0) {
    // default fallbacks if absolutely nothing is configured
    providers.push({ providerId: "openai", displayName: "OpenAI", enabled: true, supportsVariants: true });
    providers.push({ providerId: "anthropic", displayName: "Anthropic", enabled: true, supportsVariants: true });
  }

  return providers;
}
