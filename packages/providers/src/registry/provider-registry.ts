import type { ProviderRegistryEntry } from "../../../shared/src/types/model.js";

export function listProviders(): ProviderRegistryEntry[] {
  return [
    { providerId: "openai", displayName: "OpenAI", enabled: true, supportsVariants: true },
    { providerId: "anthropic", displayName: "Anthropic", enabled: true, supportsVariants: true },
  ];
}
