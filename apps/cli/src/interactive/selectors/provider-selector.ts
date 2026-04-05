import type { ProviderRegistryEntry } from "../../../../../packages/shared/src/types/model.js";
import { promptForSelection } from "../prompt.js";

export function selectProvider(providers: ProviderRegistryEntry[]): ProviderRegistryEntry {
  const provider = providers.find((entry) => entry.enabled);
  if (!provider) {
    throw new Error("No enabled provider is available.");
  }
  return provider;
}

export function ensureEnabledProviders(providers: ProviderRegistryEntry[]): ProviderRegistryEntry[] {
  const enabledProviders = providers.filter((entry) => entry.enabled);
  if (enabledProviders.length === 0) {
    throw new Error("No enabled provider is available.");
  }
  return enabledProviders;
}

export async function promptProviderSelection(providers: ProviderRegistryEntry[]): Promise<ProviderRegistryEntry> {
  return promptForSelection({
    label: "Select provider:",
    options: ensureEnabledProviders(providers),
    nonInteractiveFallback: ensureEnabledProviders(providers)[0],
  });
}
