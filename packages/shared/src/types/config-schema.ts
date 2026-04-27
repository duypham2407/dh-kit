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
  thinking: ThinkingConfigSchema.optional(),
  reasoningEffort: z.string().optional(),
});

export const ModelConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  limit: LimitSchema,
  modalities: ModalitiesSchema,
  options: ModelOptionsSchema.optional(),
  reasoning: z.boolean().optional(),
  variants: z.record(z.string(), VariantConfigSchema).optional(),
});

export const ProviderOptionsSchema = z.object({
  baseURL: z.string().optional(),
  apiKey: z.string().optional(),
  includeUsage: z.boolean().optional(),
}).catchall(z.any());

export const ProviderConfigSchema = z.object({
  name: z.string(),
  npm: z.string(),
  options: ProviderOptionsSchema.optional(),
  models: z.record(z.string(), ModelConfigSchema).optional(),
});

export const OpencodeConfigSchema = z.object({
  provider: z.record(z.string(), ProviderConfigSchema).optional(),
}).catchall(z.any());

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type VariantConfig = z.infer<typeof VariantConfigSchema>;
export type OpencodeConfig = z.infer<typeof OpencodeConfigSchema>;
