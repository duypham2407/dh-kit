import { Effect } from "effect";
import { Provider } from "./index.js";
import type { ProviderID, ModelID } from "../schema.js";

export type ProviderRegistryEntry = { providerId: string; name: string; available: boolean; priority: number };
export type ModelRegistryEntry = { providerId: string; modelId: string; name: string; available: boolean };
export type VariantRegistryEntry = { providerId: string; modelId: string; variantId: string };

function runEffect<T>(effect: Effect.Effect<T, Error, never>): T {
  // Use runSync since these are currently used in sync functions in opencode-app
  // Wait, Provider.layer uses ModelsDev.get() which returns Promise.
  // This means runSync will fail if the layer is async!
  throw new Error("Cannot run async layer synchronously. Please use the async adapter.");
}

export async function listProvidersAsync(): Promise<ProviderRegistryEntry[]> {
  const list = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* Provider.Service;
        return yield* service.list();
      }),
      Provider.layer
    )
  );

  return Object.entries(list).map(([id, info]) => ({
    providerId: id,
    name: info.name ?? id,
    available: true,
    priority: 0,
  }));
}

export async function listModelsAsync(providerId: string): Promise<ModelRegistryEntry[]> {
  const list = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* Provider.Service;
        return yield* service.list();
      }),
      Provider.layer
    )
  );

  const provider = list[providerId as ProviderID];
  if (!provider) return [];

  return Object.entries(provider.models).map(([modelId, model]: [string, any]) => ({
    providerId,
    modelId,
    name: model.name || modelId,
    available: true,
  }));
}

export async function listVariantsAsync(providerId: string, modelId: string): Promise<VariantRegistryEntry[]> {
  return [
    { providerId, modelId, variantId: "default" }
  ];
}
