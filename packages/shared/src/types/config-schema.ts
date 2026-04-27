import { z } from "zod";

export const LimitSchema = z.object({
  context: z.number(),
  output: z.number(),
});

export const ModalitiesSchema = z.object({
  input: z.array(z.string()),
  output: z.array(z.string()),
});

export const ThinkingConfigSchema = z.object({
  type: z.string(),
  budgetTokens: z.number().optional(),
});

export const ModelOptionsSchema = z.object({
  reasoningEffort: z.string().optional(),
  thinking: ThinkingConfigSchema.optional(),
});

export const VariantConfigSchema = z.object({
  disabled: z.boolean().optional(),
}).catchall(z.any());

export const CostSchema = z.object({
  input: z.number(),
  output: z.number(),
  cache_read: z.number().optional(),
  cache_write: z.number().optional(),
  context_over_200k: z.object({
    input: z.number(),
    output: z.number(),
    cache_read: z.number().optional(),
    cache_write: z.number().optional(),
  }).optional(),
});

export const ModelConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  family: z.string().optional(),
  release_date: z.string().optional(),
  attachment: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  temperature: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  interleaved: z.union([z.literal(true), z.object({ field: z.enum(["reasoning_content", "reasoning_details"]) })]).optional(),
  cost: CostSchema.optional(),
  limit: LimitSchema.optional(),
  modalities: ModalitiesSchema.optional(),
  experimental: z.boolean().optional(),
  status: z.enum(["alpha", "beta", "deprecated"]).optional(),
  provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
  options: z.record(z.string(), z.any()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  variants: z.record(z.string(), VariantConfigSchema).optional(),
});

export const ProviderOptionsSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  enterpriseUrl: z.string().optional(),
  setCacheKey: z.boolean().optional(),
  timeout: z.union([z.number(), z.literal(false)]).optional(),
  chunkTimeout: z.number().optional(),
}).catchall(z.any());

export const ProviderConfigSchema = z.object({
  api: z.string().optional(),
  name: z.string().optional(),
  env: z.array(z.string()).optional(),
  id: z.string().optional(),
  npm: z.string().optional(),
  whitelist: z.array(z.string()).optional(),
  blacklist: z.array(z.string()).optional(),
  options: ProviderOptionsSchema.optional(),
  models: z.record(z.string(), ModelConfigSchema).optional(),
});

export const OpencodeConfigSchema = z.object({
  disabled_providers: z.array(z.string()).optional(),
  enabled_providers: z.array(z.string()).optional(),
  model: z.string().optional(),
  small_model: z.string().optional(),
  provider: z.record(z.string(), ProviderConfigSchema).optional(),
}).catchall(z.any());

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type VariantConfig = z.infer<typeof VariantConfigSchema>;
export type OpencodeConfig = z.infer<typeof OpencodeConfigSchema>;
