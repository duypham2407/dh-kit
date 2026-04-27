import type { VariantRegistryEntry } from "../../../shared/src/types/model.js";
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

const DEFAULT_VARIANTS: VariantRegistryEntry[] = [
  { providerId: "openai", modelId: "gpt-5", variantId: "default", displayName: "default", available: true },
  { providerId: "openai", modelId: "gpt-5", variantId: "tool-use-optimized", displayName: "tool-use-optimized", available: true },
  { providerId: "openai", modelId: "gpt-codex", variantId: "default", displayName: "default", available: true },
  { providerId: "anthropic", modelId: "claude-opus", variantId: "high-reasoning", displayName: "high-reasoning", available: true },
  { providerId: "anthropic", modelId: "claude-opus", variantId: "default", displayName: "default", available: true },
];

export function listVariants(repoRoot: string, providerId: string, modelId: string): VariantRegistryEntry[] {
  const config = loadConfig(repoRoot);
  const modelConfig = config?.provider?.[providerId]?.models?.[modelId];
  
  if (modelConfig && modelConfig.variants) {
    return Object.entries(modelConfig.variants).map(([variantId, _variantConfig]) => ({
      providerId,
      modelId,
      variantId,
      displayName: variantId,
      available: true,
    }));
  }

  return DEFAULT_VARIANTS.filter((variant) => variant.providerId === providerId && variant.modelId === modelId);
}
