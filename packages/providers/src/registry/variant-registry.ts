import type { VariantRegistryEntry } from "../../../shared/src/types/model.js";

const VARIANTS: VariantRegistryEntry[] = [
  { providerId: "openai", modelId: "gpt-5", variantId: "default", displayName: "default", available: true },
  { providerId: "openai", modelId: "gpt-5", variantId: "tool-use-optimized", displayName: "tool-use-optimized", available: true },
  { providerId: "openai", modelId: "gpt-codex", variantId: "default", displayName: "default", available: true },
  { providerId: "anthropic", modelId: "claude-opus", variantId: "high-reasoning", displayName: "high-reasoning", available: true },
  { providerId: "anthropic", modelId: "claude-opus", variantId: "default", displayName: "default", available: true },
];

export function listVariants(providerId: string, modelId: string): VariantRegistryEntry[] {
  return VARIANTS.filter((variant) => variant.providerId === providerId && variant.modelId === modelId);
}
