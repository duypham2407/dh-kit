import { runConfigAgentFlow } from "../interactive/config-agent-flow.js";
import { runConfigEmbeddingFlow } from "../interactive/config-embedding-flow.js";
import { verifyConfiguredModelForLane } from "../../../../packages/opencode-app/src/config/verify-configured-model.js";
import { createConfigService } from "../../../../packages/opencode-app/src/config/config-service.js";
import type { SemanticMode } from "../../../../packages/shared/src/types/lane.js";

const VALID_SEMANTIC_MODES: SemanticMode[] = ["always", "auto", "off"];

const CONFIG_HELP = `dh config <option>

Options:
  --agent                                 Configure agent model assignment
  --verify-agent [quick|delivery|migration]  Verify configured model for a lane
  --semantic [always|auto|off]            Set semantic retrieval mode
  --semantic                              Show current semantic retrieval mode
  --embedding                             Configure embedding provider settings
  --show                                  Show all current configuration`;

export async function runConfigCommand(args: string[], repoRoot: string): Promise<number> {
  if (args[0] === "--agent") {
    const result = await runConfigAgentFlow(repoRoot);
    process.stdout.write(`${result.summary}\n`);
    return 0;
  }

  if (args[0] === "--verify-agent") {
    const lane = (args[1] ?? "quick") as "quick" | "delivery" | "migration";
    const result = await verifyConfiguredModelForLane({ repoRoot, lane });
    process.stdout.write(`${result.summary}\n`);
    return result.ok ? 0 : 1;
  }

  if (args[0] === "--semantic") {
    const configService = createConfigService(repoRoot);
    const modeArg = args[1];

    if (!modeArg) {
      // Show current mode
      const current = configService.getSemanticMode();
      process.stdout.write(`semantic mode: ${current}\n`);
      return 0;
    }

    if (!VALID_SEMANTIC_MODES.includes(modeArg as SemanticMode)) {
      process.stderr.write(`Invalid semantic mode: "${modeArg}". Must be one of: ${VALID_SEMANTIC_MODES.join(", ")}\n`);
      return 1;
    }

    const previous = configService.getSemanticMode();
    configService.setSemanticMode(modeArg as SemanticMode);
    process.stdout.write(`semantic mode: ${previous} -> ${modeArg}\n`);
    return 0;
  }

  if (args[0] === "--embedding") {
    const result = await runConfigEmbeddingFlow(repoRoot);
    process.stdout.write(`${result.summary}\n`);
    return 0;
  }

  if (args[0] === "--show") {
    const configService = createConfigService(repoRoot);
    const semanticMode = configService.getSemanticMode();
    const embeddingConfig = configService.getEmbeddingConfig();
    const assignments = await configService.listAssignments();
    const keySet = typeof process.env[embeddingConfig.apiKeyEnvVar] === "string" && process.env[embeddingConfig.apiKeyEnvVar]!.length > 0;

    const lines = [
      "dh config",
      "",
      "Semantic retrieval:",
      `  mode: ${semanticMode}`,
      "",
      "Embedding provider:",
      `  provider: ${embeddingConfig.providerId}`,
      `  model: ${embeddingConfig.modelName}`,
      `  dimensions: ${embeddingConfig.dimensions}`,
      `  api key (${embeddingConfig.apiKeyEnvVar}): ${keySet ? "set" : "NOT SET"}`,
      "",
      "Agent model assignments:",
    ];

    if (assignments.length === 0) {
      lines.push("  (none configured -- using defaults)");
    } else {
      for (const a of assignments) {
        lines.push(`  ${a.agentId}: ${a.providerId}/${a.modelId}/${a.variantId}`);
      }
    }

    process.stdout.write(`${lines.join("\n")}\n`);
    return 0;
  }

  process.stderr.write(`${CONFIG_HELP}\n`);
  return 1;
}
