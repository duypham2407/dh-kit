import fs from "node:fs";
import path from "node:path";
import { OpencodeConfigSchema, type OpencodeConfig } from "../../../shared/src/types/config-schema.js";

export function loadOpencodeConfig(repoRoot: string): OpencodeConfig | undefined {
  const configPath = path.join(repoRoot, "opencode.json");
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const json = JSON.parse(content);
    return OpencodeConfigSchema.parse(json);
  } catch (e) {
    console.error("Failed to parse opencode.json:", e);
    return undefined;
  }
}
