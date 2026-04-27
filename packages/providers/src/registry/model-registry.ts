import type { ModelRegistryEntry } from "../../../shared/src/types/model.js";
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

const DEFAULT_MODELS: ModelRegistryEntry[] = [
  { providerId: "openai", modelId: "gpt-5", displayName: "gpt-5", available: true, supportsVariants: true },
  { providerId: "openai", modelId: "gpt-codex", displayName: "gpt-codex", available: true, supportsVariants: true },
  { providerId: "anthropic", modelId: "claude-opus", displayName: "claude-opus", available: true, supportsVariants: true },
];

export function listModels(repoRoot: string, providerId: string): ModelRegistryEntry[] {
  const config = loadConfig(repoRoot);
  const providerConfig = config?.provider?.[providerId];
  
  if (providerConfig && providerConfig.models) {
    return Object.entries(providerConfig.models).map(([modelId, modelConfig]) => ({
      providerId,
      modelId,
      displayName: modelConfig.name || modelId,
      available: true,
      supportsVariants: !!modelConfig.variants && Object.keys(modelConfig.variants).length > 0,
    }));
  }

  return DEFAULT_MODELS.filter((model) => model.providerId === providerId);
}
