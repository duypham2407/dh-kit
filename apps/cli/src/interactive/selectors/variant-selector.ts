import type { VariantRegistryEntry } from "../../../../../packages/shared/src/types/model.js";
import { promptForSelection } from "../prompt.js";

export function selectVariant(variants: VariantRegistryEntry[]): VariantRegistryEntry {
  const variant = variants.find((entry) => entry.available);
  if (!variant) {
    throw new Error("No available variant is available.");
  }
  return variant;
}

export function ensureAvailableVariants(variants: VariantRegistryEntry[]): VariantRegistryEntry[] {
  const availableVariants = variants.filter((entry) => entry.available);
  if (availableVariants.length === 0) {
    throw new Error("No available variant is available.");
  }
  return availableVariants;
}

export async function promptVariantSelection(variants: VariantRegistryEntry[]): Promise<VariantRegistryEntry> {
  return promptForSelection({
    label: "Select variant:",
    options: ensureAvailableVariants(variants),
    nonInteractiveFallback: ensureAvailableVariants(variants)[0],
  });
}
