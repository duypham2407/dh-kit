import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
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

export function createLanguageModel(repoRoot: string, providerId: string, modelId: string): LanguageModel {
  const config = loadConfig(repoRoot);
  const providerConfig = config?.provider?.[providerId];

  let npm = "@ai-sdk/openai";
  let baseURL: string | undefined = undefined;
  let apiKey: string | undefined = undefined;

  if (providerConfig) {
    npm = providerConfig.npm || npm;
    baseURL = providerConfig.options?.baseURL;
    apiKey = providerConfig.options?.apiKey;
  }

  // Fallback to environment variables if apiKey is missing
  if (!apiKey) {
    if (npm === "@ai-sdk/anthropic" || providerId === "anthropic") {
      apiKey = process.env.ANTHROPIC_API_KEY;
    } else {
      apiKey = process.env.OPENAI_API_KEY;
    }
  }

  if (npm === "@ai-sdk/anthropic") {
    const anthropic = createAnthropic({ baseURL, apiKey });
    return anthropic(modelId);
  } else {
    // Default to OpenAI compatible
    const openai = createOpenAI({ baseURL, apiKey });
    return openai(modelId);
  }
}
