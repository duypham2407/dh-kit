import { Effect, Context, Layer } from "effect";
import { Model, Info, ListResult } from "../../../shared/src/types/model.js";
import { ProviderID, ModelID } from "../schema.js";
import { InstanceState } from "../effect/instance-state.js";
import * as ModelsDev from "../models-dev.js";

export type { Model, Info, ListResult };
export { ProviderID, ModelID };

type BundledSDK = any;
const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {
  "@ai-sdk/amazon-bedrock": () => import("@ai-sdk/amazon-bedrock").then((m) => m.createAmazonBedrock),
  "@ai-sdk/anthropic": () => import("@ai-sdk/anthropic").then((m) => m.createAnthropic),
  "@ai-sdk/azure": () => import("@ai-sdk/azure").then((m) => m.createAzure),
  "@ai-sdk/google": () => import("@ai-sdk/google").then((m) => m.createGoogleGenerativeAI),
  "@ai-sdk/google-vertex": () => import("@ai-sdk/google-vertex").then((m) => m.createVertex),
  "@ai-sdk/google-vertex/anthropic": () =>
    import("@ai-sdk/google-vertex/anthropic").then((m) => m.createVertexAnthropic),
  "@ai-sdk/openai": () => import("@ai-sdk/openai").then((m) => m.createOpenAI),
  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
  "@openrouter/ai-sdk-provider": () => import("@openrouter/ai-sdk-provider").then((m) => m.createOpenRouter),
  "@ai-sdk/xai": () => import("@ai-sdk/xai").then((m) => m.createXai),
  "@ai-sdk/mistral": () => import("@ai-sdk/mistral").then((m) => m.createMistral),
  "@ai-sdk/groq": () => import("@ai-sdk/groq").then((m) => m.createGroq),
  "@ai-sdk/deepinfra": () => import("@ai-sdk/deepinfra").then((m) => m.createDeepInfra),
  "@ai-sdk/gateway": () => import("@ai-sdk/gateway").then((m) => m.createGateway),
};

export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>, never, never>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info, never, never>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model, Error, never>
  readonly getLanguage: (model: Model) => Effect.Effect<any, Error, never>
}

export const Service = Context.GenericTag<Interface>("@opencode/Provider");

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const modelsDev = yield* Effect.promise(() => ModelsDev.get());

    return {
      list: () => Effect.succeed(modelsDev as Record<ProviderID, Info>),
      getProvider: (providerID: ProviderID) => Effect.succeed(modelsDev[providerID] as Info),
      getModel: (providerID: ProviderID, modelID: ModelID) => {
        const provider = modelsDev[providerID];
        if (!provider) return Effect.fail(new Error("Provider not found"));
        const model = provider.models[modelID];
        if (!model) return Effect.fail(new Error("Model not found"));
        return Effect.succeed(model as unknown as Model);
      },
      getLanguage: (model: Model) => Effect.gen(function* () {
        const api = (model as any).api as { npm?: string; url?: string; id?: string } | undefined;
        const npm = api?.npm || "@ai-sdk/openai-compatible";
        const loader = BUNDLED_PROVIDERS[npm];
        if (!loader) yield* Effect.fail(new Error("Unsupported provider SDK: " + npm));

        const sdkCreator = yield* Effect.promise(() => loader());
        const sdk = sdkCreator({ baseURL: api?.url });

        return sdk.languageModel(api?.id ?? model.id ?? "default");
      })

    };
  })
);
