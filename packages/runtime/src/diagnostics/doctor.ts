import fs from "node:fs/promises";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";
import { openDhDatabase, resolveSqliteDbPath } from "../../../storage/src/sqlite/db.js";
import { checkDatabaseIntegrity, checkDatabaseReadable } from "../../../storage/src/sqlite/db-health.js";
import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import { listProviders } from "../../../providers/src/registry/provider-registry.js";
import { listModels } from "../../../providers/src/registry/model-registry.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { isEmbeddingKeyAvailable } from "../../../retrieval/src/semantic/embedding-pipeline.js";
import { DEFAULT_EMBEDDING_CONFIG } from "../../../shared/src/types/embedding.js";
import type { EmbeddingProviderConfig } from "../../../shared/src/types/embedding.js";
import { getQualityGateAvailabilitySnapshot } from "../workflow/quality-gates-runtime.js";
import fsSync from "node:fs";
import path from "node:path";

export type DoctorReport = {
  ok: boolean;
  summary: string;
  actions: string[];
  hookReadiness: {
    goBinaryReady: boolean;
    sqliteBridgeReady: boolean;
    hookLogsPresent: boolean;
  };
  diagnostics: {
    providerCoverage: {
      providersWithoutModels: string[];
      totalProviders: number;
      totalModels: number;
    };
    verificationHealth: {
      contractVersion: string;
      availableCount: number;
      unavailableCount: number;
      notConfiguredCount: number;
      ruleScanAvailability: "available" | "unavailable" | "not_configured";
      securityScanAvailability: "available" | "unavailable" | "not_configured";
    };
  };
  /** Machine-readable snapshot for CI/monitoring ingestion. */
  snapshot: DoctorSnapshot;
};

/** Compact machine-readable snapshot for monitoring pipelines. */
export type DoctorSnapshot = {
  timestamp: string;
  ok: boolean;
  tables: { required: number; present: number; missing: string[] };
  dbIntegrity: { ok: boolean; details: string[] };
  chunks: number;
  embeddings: number;
  embeddingModel: string;
  embeddingKeySet: boolean;
  semanticMode: string;
  providers: number;
  models: number;
  agents: number;
  goBinaryReady: boolean;
  sqliteBridgeReady: boolean;
  hookLogsPresent: boolean;
  workflowMirrorPresent: boolean;
  qualityGateContractVersion: string;
  qualityGateAvailableCount: number;
  qualityGateUnavailableCount: number;
  qualityGateNotConfiguredCount: number;
  ruleScanAvailability: "available" | "unavailable" | "not_configured";
  securityScanAvailability: "available" | "unavailable" | "not_configured";
  actionCount: number;
};

export async function runDoctor(repoRoot: string): Promise<DoctorReport> {
  const paths = resolveDhPaths(repoRoot);
  await fs.mkdir(paths.configHome, { recursive: true });
  await fs.mkdir(paths.dataHome, { recursive: true });
  await fs.mkdir(paths.cacheHome, { recursive: true });
  const database = openDhDatabase(repoRoot);
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC").all() as Array<{ name: string }>;

  const requiredTables = [
    "config",
    "agent_model_assignments",
    "sessions",
    "workflow_state",
    "execution_envelopes",
    "work_items",
    "tool_usage_audit",
    "skill_activation_audit",
    "mcp_route_audit",
    "quality_gate_audit",
    "hook_invocation_logs",
    "role_outputs",
    "chunks",
    "embeddings",
  ];
  const availableTables = new Set(tables.map((table) => table.name));
  const missingTables = requiredTables.filter((table) => !availableTables.has(table));

  // Database integrity check
  const integrityResult = checkDatabaseIntegrity(repoRoot);

  const providers = listProviders();
  const modelsByProvider = new Map<string, number>();
  for (const provider of providers) {
    modelsByProvider.set(provider.providerId, listModels(provider.providerId).length);
  }
  const providersWithoutModels = providers
    .filter((provider) => (modelsByProvider.get(provider.providerId) ?? 0) === 0)
    .map((provider) => provider.providerId);
  const totalModels = Array.from(modelsByProvider.values()).reduce((sum, count) => sum + count, 0);
  const configRepo = new ConfigRepo(repoRoot);
  const semanticMode = configRepo.read<string>("semantic.mode") ?? "always";

  // Embedding config: respect stored overrides
  const storedEmbedding = configRepo.read<Partial<EmbeddingProviderConfig>>("embedding.provider");
  const effectiveEmbeddingConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...storedEmbedding };
  const embeddingKeyAvailable = isEmbeddingKeyAvailable(effectiveEmbeddingConfig);
  const embeddingModel = effectiveEmbeddingConfig.modelName;
  const embeddingKeyVar = effectiveEmbeddingConfig.apiKeyEnvVar;

  let embeddingCount = 0;
  let chunkCount = 0;
  try {
    const embRepo = new EmbeddingsRepo(repoRoot);
    embeddingCount = embRepo.countByModel(embeddingModel);
    const chunksRepo = new ChunksRepo(repoRoot);
    chunkCount = chunksRepo.count();
  } catch {
    // DB might not have tables yet on first run
  }

  const workflowMirrorPath = `${repoRoot}/.dh/workflow-state.json`;
  const workflowMirrorExists = fsSync.existsSync(workflowMirrorPath);
  const goBinaryPath = path.join(repoRoot, "packages", "opencode-core", "dist", "dh");
  const goBinaryReady = fsSync.existsSync(goBinaryPath);

  let hookLogsPresent = false;
  try {
    const hookCountRow = database.prepare("SELECT COUNT(*) as count FROM hook_invocation_logs").get() as { count: number };
    hookLogsPresent = hookCountRow.count > 0;
  } catch {
    hookLogsPresent = false;
  }

  const sqliteBridgeReady = availableTables.has("hook_invocation_logs") && goBinaryReady;
  const qualityGateAvailability = getQualityGateAvailabilitySnapshot(repoRoot);

  const statusOk = missingTables.length === 0 && providers.length > 0 && DEFAULT_AGENT_REGISTRY.length > 0 && integrityResult.ok;

  // Build actionable next-steps
  const actions: string[] = [];

  if (!integrityResult.ok) {
    actions.push(`Database integrity check FAILED: ${integrityResult.details.join("; ")}. Run "dh recover" to attempt automatic repair.`);
  }

  if (!embeddingKeyAvailable && semanticMode !== "off") {
    actions.push(`Set ${embeddingKeyVar} to enable real embeddings: export ${embeddingKeyVar}="sk-..."`);
  }

  if (chunkCount === 0) {
    actions.push(`Run "dh index" to index this repository for semantic retrieval.`);
  } else if (embeddingCount === 0) {
    actions.push(`Chunks exist (${chunkCount}) but no embeddings yet. Run "dh index" to generate embeddings.`);
  }

  if (semanticMode === "off") {
    actions.push(`Semantic retrieval is disabled. Enable with: dh config --semantic always`);
  }

  if (providersWithoutModels.length > 0) {
    actions.push(`Provider registry mismatch: providers without models: ${providersWithoutModels.join(", ")}.`);
  }

  if (embeddingModel !== DEFAULT_EMBEDDING_CONFIG.modelName) {
    actions.push(`Custom embedding model: ${embeddingModel} (default: ${DEFAULT_EMBEDDING_CONFIG.modelName}). Change with: dh config --embedding`);
  }

  const summaryLines = [
    "dh doctor",
    "",
    "Paths:",
    `  config: ${paths.configHome}`,
    `  data:   ${paths.dataHome}`,
    `  cache:  ${paths.cacheHome}`,
    `  sqlite: ${resolveSqliteDbPath(repoRoot)}`,
    "",
    "Database:",
    `  integrity: ${integrityResult.ok ? "OK" : `FAILED — ${integrityResult.details.join("; ")}`}`,
    `  tables: ${missingTables.length === 0 ? `all ${requiredTables.length} present` : `missing: ${missingTables.join(", ")}`}`,
    `  chunks: ${chunkCount}`,
    `  embeddings: ${embeddingCount} (model: ${embeddingModel})`,
    "",
    "Providers:",
    `  registered: ${providers.length > 0 ? `yes (${providers.length})` : "no"}`,
    `  models: ${totalModels}`,
    `  providers without models: ${providersWithoutModels.length === 0 ? "none" : providersWithoutModels.join(", ")}`,
    `  agents: ${DEFAULT_AGENT_REGISTRY.length > 0 ? `yes (${DEFAULT_AGENT_REGISTRY.length})` : "no"}`,
    "",
    "Retrieval:",
    `  semantic mode: ${semanticMode}`,
    `  embedding provider: ${effectiveEmbeddingConfig.providerId}`,
    `  embedding model: ${embeddingModel}`,
    `  api key (${embeddingKeyVar}): ${embeddingKeyAvailable ? "set" : "NOT SET"}`,
    "",
    "Workflow:",
    `  mirror: ${workflowMirrorExists ? "yes" : "no"}`,
    "",
    "Verification health:",
    `  contract: ${qualityGateAvailability.contractVersion}`,
    `  gates: available=${qualityGateAvailability.summary.availableCount}, unavailable=${qualityGateAvailability.summary.unavailableCount}, not_configured=${qualityGateAvailability.summary.notConfiguredCount}`,
    `  rule_scan: ${qualityGateAvailability.gates.rule_scan.availability}`,
    `  security_scan: ${qualityGateAvailability.gates.security_scan.availability}`,
    "",
    "Hooks:",
    `  go binary: ${goBinaryReady ? "yes" : "no"}`,
    `  sqlite bridge: ${sqliteBridgeReady ? "ready" : "not ready"}`,
    `  hook logs present: ${hookLogsPresent ? "yes" : "no"}`,
    "",
    `Status: ${statusOk ? "OK" : "ISSUES FOUND"}`,
  ];

  if (chunkCount === 0) {
    summaryLines.push("", "First-time setup:", "  1. dh index", "  2. dh ask \"how does this project work?\"");
  }

  if (actions.length > 0) {
    summaryLines.push("", "Recommended actions:");
    for (const action of actions) {
      summaryLines.push(`  -> ${action}`);
    }
  }

  return {
    ok: statusOk,
    summary: summaryLines.join("\n"),
    actions,
    hookReadiness: {
      goBinaryReady,
      sqliteBridgeReady,
      hookLogsPresent,
    },
    diagnostics: {
      providerCoverage: {
        providersWithoutModels,
        totalProviders: providers.length,
        totalModels,
      },
      verificationHealth: {
        contractVersion: qualityGateAvailability.contractVersion,
        availableCount: qualityGateAvailability.summary.availableCount,
        unavailableCount: qualityGateAvailability.summary.unavailableCount,
        notConfiguredCount: qualityGateAvailability.summary.notConfiguredCount,
        ruleScanAvailability: qualityGateAvailability.gates.rule_scan.availability,
        securityScanAvailability: qualityGateAvailability.gates.security_scan.availability,
      },
    },
    snapshot: {
      timestamp: new Date().toISOString(),
      ok: statusOk,
      tables: {
        required: requiredTables.length,
        present: requiredTables.length - missingTables.length,
        missing: missingTables,
      },
      dbIntegrity: {
        ok: integrityResult.ok,
        details: integrityResult.details,
      },
      chunks: chunkCount,
      embeddings: embeddingCount,
      embeddingModel,
      embeddingKeySet: embeddingKeyAvailable,
      semanticMode,
      providers: providers.length,
      models: totalModels,
      agents: DEFAULT_AGENT_REGISTRY.length,
      goBinaryReady,
      sqliteBridgeReady,
      hookLogsPresent,
      workflowMirrorPresent: workflowMirrorExists,
      qualityGateContractVersion: qualityGateAvailability.contractVersion,
      qualityGateAvailableCount: qualityGateAvailability.summary.availableCount,
      qualityGateUnavailableCount: qualityGateAvailability.summary.unavailableCount,
      qualityGateNotConfiguredCount: qualityGateAvailability.summary.notConfiguredCount,
      ruleScanAvailability: qualityGateAvailability.gates.rule_scan.availability,
      securityScanAvailability: qualityGateAvailability.gates.security_scan.availability,
      actionCount: actions.length,
    },
  };
}
