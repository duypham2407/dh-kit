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
import {
  probeRustCapabilitySummary,
  probeRustEngineStatus,
  summarizeRuntimePing,
  type RustRuntimePingState,
  type RustRuntimePingSummary,
  type RustParserFreshnessSummary,
} from "./rust-engine-status.js";
import { createDhJsonRpcStdioClient, DhBridgeError } from "../../../opencode-app/src/bridge/dh-jsonrpc-stdio-client.js";
import type { RuntimeProbePingResult } from "./bridge-runtime-probe.js";

export type DoctorReport = {
  ok: boolean;
  summary: string;
  actions: string[];
  hookReadiness: {
    runtimeBinaryReady: boolean;
    sqliteBridgeReady: boolean;
    hookLogsPresent: boolean;
  };
  diagnostics: {
    lifecycleClassification: DoctorLifecycleClassification;
    rustHostedKnowledgePath: RustHostedKnowledgePathView;
    runtimePingLifecycleSeam: RuntimePingLifecycleSeamView;
    capabilitySummary: RustCapabilitySummary;
    parserFreshnessSummary: RustParserFreshnessView;
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

export type LifecycleStatus = "healthy" | "degraded" | "unsupported" | "misconfigured";

export type DoctorLifecycleClassification = {
  overall: LifecycleStatus;
  installDistribution: {
    status: LifecycleStatus;
    reasons: string[];
  };
  runtimeWorkspaceReadiness: {
    status: LifecycleStatus;
    reasons: string[];
  };
  capabilityTooling: {
    status: LifecycleStatus;
    reasons: string[];
  };
};

/** Compact machine-readable snapshot for monitoring pipelines. */
export type DoctorSnapshot = {
  timestamp: string;
  ok: boolean;
  lifecycleStatus: LifecycleStatus;
  installDistributionStatus: LifecycleStatus;
  runtimeWorkspaceReadinessStatus: LifecycleStatus;
  capabilityToolingStatus: LifecycleStatus;
  installDistributionReasons: string[];
  runtimeWorkspaceReadinessReasons: string[];
  capabilityToolingReasons: string[];
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
  runtimeBinaryReady: boolean;
  sqliteBridgeReady: boolean;
  hookLogsPresent: boolean;
  workflowMirrorPresent: boolean;
  qualityGateContractVersion: string;
  qualityGateAvailableCount: number;
  qualityGateUnavailableCount: number;
  qualityGateNotConfiguredCount: number;
  ruleScanAvailability: "available" | "unavailable" | "not_configured";
  securityScanAvailability: "available" | "unavailable" | "not_configured";
  rustHostedKnowledgePath: RustHostedKnowledgePathView;
  actionCount: number;
  capabilitySummary: RustCapabilitySummary;
  parserFreshnessSummary: RustParserFreshnessView;
  runtimePingLifecycleSeam: RuntimePingLifecycleSeamView;
  runtimePingLifecycleSeamState: RustRuntimePingState;
  capabilityStateSummary: {
    supported: number;
    partial: number;
    bestEffort: number;
    unsupported: number;
  };
};

type OperatorReadinessCondition = "ready" | "ready-with-known-degradation" | "blocked";

type RustCapabilitySummary =
  | {
    source: "rust_bridge";
    available: true;
    states: {
      supported: number;
      partial: number;
      bestEffort: number;
      unsupported: number;
    };
    capabilityCount: number;
  }
  | {
    source: "rust_bridge";
    available: false;
    reason: string;
  };

type RustParserFreshnessView =
  | {
    source: "rust_status";
    available: true;
    summary: RustParserFreshnessSummary;
  }
  | {
    source: "rust_status";
    available: false;
    reason: string;
  };

type RuntimePingLifecycleSeamView = {
  source: "runtime.ping";
  available: boolean;
  state: RustRuntimePingState;
  reason: string;
  summary?: RustRuntimePingSummary;
};

type RustHostedKnowledgePathView = {
  source: "rust_host_lifecycle_authority";
  available: boolean;
  status: LifecycleStatus;
  topology: "rust_host_ts_worker";
  supportBoundary: "knowledge_commands_first_wave";
  supportedCommands: Array<"ask" | "explain" | "trace">;
  buildEvidenceSupport: "bounded_rust_hosted_broad_ask_only";
  workerRole: "typescript_worker";
  legacyPathLabel: "legacy_ts_host_bridge_compatibility_only";
  targetPlatforms: Array<"linux" | "macos">;
  workerBundleReady: boolean;
  workerManifestReady: boolean;
  flatReleaseAssetsReady: boolean;
  workerBundlePath: string;
  workerManifestPath: string;
  reasons: string[];
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

  const providers = listProviders(repoRoot);
  const modelsByProvider = new Map<string, number>();
  for (const provider of providers) {
    modelsByProvider.set(provider.providerId, listModels(repoRoot, provider.providerId).length);
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
  const releaseDir = path.join(repoRoot, "dist", "releases");
  const releaseManifestPath = path.join(releaseDir, "manifest.json");
  const releaseChecksumsPath = path.join(releaseDir, "SHA256SUMS");
  const releaseWorkerBundlePath = path.join(releaseDir, "ts-worker", "worker.mjs");
  const releaseWorkerManifestPath = path.join(releaseDir, "ts-worker", "manifest.json");
  const flatReleaseWorkerBundlePath = path.join(releaseDir, "worker.mjs");
  const flatReleaseWorkerManifestPath = path.join(releaseDir, "worker-manifest.json");
  const runtimeBinaryCandidates = [
    path.join(releaseDir, "dh-darwin-arm64"),
    path.join(releaseDir, "dh-darwin-amd64"),
    path.join(releaseDir, "dh-linux-amd64"),
    path.join(releaseDir, "dh-linux-arm64"),
  ];
  const runtimeBinaryReady = runtimeBinaryCandidates.some((candidate) => fsSync.existsSync(candidate));
  const rustHostedKnowledgePath = summarizeRustHostedKnowledgePath({
    workerBundlePath: releaseWorkerBundlePath,
    workerManifestPath: releaseWorkerManifestPath,
    flatWorkerBundlePath: flatReleaseWorkerBundlePath,
    flatWorkerManifestPath: flatReleaseWorkerManifestPath,
  });

  let hookLogsPresent = false;
  try {
    const hookCountRow = database.prepare("SELECT COUNT(*) as count FROM hook_invocation_logs").get() as { count: number };
    hookLogsPresent = hookCountRow.count > 0;
  } catch {
    hookLogsPresent = false;
  }

  const sqliteBridgeReady = availableTables.has("hook_invocation_logs") && runtimeBinaryReady;
  const qualityGateAvailability = getQualityGateAvailabilitySnapshot(repoRoot);
  const rustCapabilitySummary = await summarizeRustCapabilityState(repoRoot);
  const runtimePingLifecycleSeam = await summarizeRuntimePingLifecycleSeam(repoRoot);
  const rustFreshnessProbe = await probeRustEngineStatus(repoRoot);
  const parserFreshnessSummary: RustParserFreshnessView = rustFreshnessProbe.ok && rustFreshnessProbe.freshness
    ? {
      source: "rust_status",
      available: true,
      summary: rustFreshnessProbe.freshness,
    }
    : {
      source: "rust_status",
      available: false,
      reason: rustFreshnessProbe.unavailableReason ?? "rust status output did not expose parser freshness summary",
    };

  const capabilityStateSummary = rustCapabilitySummary.available
    ? rustCapabilitySummary.states
    : {
      supported: 0,
      partial: 0,
      bestEffort: 0,
      unsupported: 0,
    };

  const installDistributionReasons: string[] = [];
  const runtimeWorkspaceReasons: string[] = [];
  const capabilityToolingReasons: string[] = [];

  if (!runtimeBinaryReady) {
    installDistributionReasons.push("Runtime release binary is not present under dist/releases (dh-<platform>-<arch>). ");
  }
  if (!fsSync.existsSync(releaseManifestPath)) {
    installDistributionReasons.push("Release manifest is not present at dist/releases/manifest.json.");
  }
  if (!fsSync.existsSync(releaseChecksumsPath)) {
    installDistributionReasons.push("Release checksums are not present at dist/releases/SHA256SUMS.");
  }
  installDistributionReasons.push(...rustHostedKnowledgePath.reasons);

  if (!integrityResult.ok) {
    runtimeWorkspaceReasons.push(`SQLite integrity failed: ${integrityResult.details.join("; ")}`);
  }
  if (missingTables.length > 0) {
    runtimeWorkspaceReasons.push(`Required tables missing: ${missingTables.join(", ")}`);
  }
  if (!workflowMirrorExists) {
    runtimeWorkspaceReasons.push("Workflow compatibility mirror is missing (.dh/workflow-state.json).");
  }

  if (!embeddingKeyAvailable && semanticMode !== "off") {
    capabilityToolingReasons.push(`Embedding API key is not configured (${embeddingKeyVar}).`);
  }
  if (providersWithoutModels.length > 0) {
    capabilityToolingReasons.push(`Providers without models: ${providersWithoutModels.join(", ")}`);
  }
  if (qualityGateAvailability.summary.unavailableCount > 0) {
    capabilityToolingReasons.push(`Unavailable quality gates: ${qualityGateAvailability.summary.unavailableCount}`);
  }

  const installDistributionStatus: LifecycleStatus = installDistributionReasons.length > 0 ? "degraded" : "healthy";

  const runtimeWorkspaceReadinessStatus: LifecycleStatus = !integrityResult.ok || missingTables.length > 0
    ? "misconfigured"
    : runtimeWorkspaceReasons.length > 0
      ? "degraded"
      : "healthy";

  let capabilityToolingStatus: LifecycleStatus = "healthy";
  if (providers.length === 0 || totalModels === 0) {
    capabilityToolingStatus = "unsupported";
  } else if (!embeddingKeyAvailable && semanticMode !== "off") {
    capabilityToolingStatus = "misconfigured";
  } else if (capabilityToolingReasons.length > 0 || qualityGateAvailability.summary.notConfiguredCount > 0) {
    capabilityToolingStatus = "degraded";
  }

  const lifecycleStatuses: LifecycleStatus[] = [
    installDistributionStatus,
    runtimeWorkspaceReadinessStatus,
    capabilityToolingStatus,
  ];
  const lifecycleStatus: LifecycleStatus = lifecycleStatuses.includes("misconfigured")
    ? "misconfigured"
    : lifecycleStatuses.includes("unsupported")
      ? "unsupported"
      : lifecycleStatuses.includes("degraded")
        ? "degraded"
        : "healthy";

  const statusOk = missingTables.length === 0 && providers.length > 0 && DEFAULT_AGENT_REGISTRY.length > 0 && integrityResult.ok;

  const operatorReadinessCondition: OperatorReadinessCondition = lifecycleStatus === "healthy"
    ? "ready"
    : statusOk
      ? "ready-with-known-degradation"
      : "blocked";

  // Build actionable next-steps
  const actions: string[] = [];

  if (!integrityResult.ok) {
    actions.push(`Database integrity check FAILED: ${integrityResult.details.join("; ")}. Run "dh recover" to attempt automatic repair.`);
  }

  if (!runtimeBinaryReady) {
    actions.push("Install/distribution readiness is degraded: runtime release binary is missing under dist/releases. Build release artifacts or reinstall the runtime bundle.");
  }

  if (rustHostedKnowledgePath.status !== "healthy") {
    actions.push("Rust-hosted first-wave knowledge-command readiness is degraded: build/package ts-worker/worker.mjs and ts-worker/manifest.json before claiming ask/explain/trace release readiness.");
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

  if (!workflowMirrorExists) {
    actions.push("Runtime/workspace readiness is degraded: workflow mirror is missing (.dh/workflow-state.json). Run a workflow command to initialize state.");
  }

  if (providersWithoutModels.length > 0) {
    actions.push(`Provider registry mismatch: providers without models: ${providersWithoutModels.join(", ")}.`);
  }

  if (embeddingModel !== DEFAULT_EMBEDDING_CONFIG.modelName) {
    actions.push(`Custom embedding model: ${embeddingModel} (default: ${DEFAULT_EMBEDDING_CONFIG.modelName}). Change with: dh config --embedding`);
  }

  if (qualityGateAvailability.summary.unavailableCount > 0 || qualityGateAvailability.summary.notConfiguredCount > 0) {
    actions.push(
      `Capability/tooling readiness is degraded: quality gates unavailable=${qualityGateAvailability.summary.unavailableCount}, not_configured=${qualityGateAvailability.summary.notConfiguredCount}.`,
    );
  }

  const summaryLines = [
    "dh doctor",
    "",
    "Operator summary:",
    "  surface: product/install/workspace health (dh doctor)",
    `  condition: ${operatorReadinessCondition}`,
    `  why: lifecycle=${lifecycleStatus}; install=${installDistributionStatus}, runtime=${runtimeWorkspaceReadinessStatus}, capability=${capabilityToolingStatus}`,
    `  works: ${operatorReadinessCondition === "blocked" ? "diagnostics and remediation guidance still available" : "core dh commands remain available with listed constraints"}`,
    `  limited: ${operatorReadinessCondition === "ready" ? "none detected" : "degraded, unsupported, or misconfigured surfaces require attention before claiming full health"}`,
    `  next: ${actions[0] ?? "Run \"dh index\" then \"dh ask \\\"how does this project work?\\\"\""}`,
    "",
    "Boundary:",
    "  this command reports product/install/workspace health only.",
    "  for workflow-state, evidence, or policy inspection use:",
    "  node .opencode/workflow-state.js status|show|show-policy-status|show-invocations|check-stage-readiness|resume-summary",
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
    "Rust-hosted knowledge-command lifecycle authority:",
    "  support boundary: ask/explain/trace first-wave knowledge commands only",
    `  topology: ${rustHostedKnowledgePath.topology}`,
    "  lifecycle authority: Rust host owns startup, spawn, readiness, health, timeout, recovery, shutdown, cleanup, and final exit on this supported path",
    "  build-evidence support: bounded Rust-hosted broad ask only; finite static subjects use Rust-authored query.buildEvidence packet truth",
    "  TypeScript role: worker for workflow/output; not host lifecycle authority on this supported path",
    `  legacy path label: ${rustHostedKnowledgePath.legacyPathLabel}`,
    "  legacy boundary: TypeScript-hosted Rust bridge and retrieval packet paths are compatibility-only and not canonical authority for touched Rust-hosted build-evidence flows",
    `  platforms: ${rustHostedKnowledgePath.targetPlatforms.join("/")} only`,
    `  worker bundle: ${rustHostedKnowledgePath.workerBundleReady ? "ready" : "missing"} (${rustHostedKnowledgePath.workerBundlePath})`,
    `  worker manifest: ${rustHostedKnowledgePath.workerManifestReady ? "ready" : "missing"} (${rustHostedKnowledgePath.workerManifestPath})`,
    `  flat release worker assets: ${rustHostedKnowledgePath.flatReleaseAssetsReady ? "ready" : "missing"}`,
    `  readiness: ${rustHostedKnowledgePath.status}`,
    "  boundary: no universal repository reasoning, runtime tracing support, daemon mode, worker pool, remote/local socket control plane, Windows platform support, shell/worktree orchestration redesign, or full workflow-lane parity is claimed",
    "",
    "runtime.ping compatibility seam:",
    "  source: legacy TypeScript-hosted Rust bridge runtime.ping compatibility probe",
    `  state: ${runtimePingLifecycleSeam.state}`,
    `  reason: ${runtimePingLifecycleSeam.reason}`,
    runtimePingLifecycleSeam.summary
      ? `  ok: ${runtimePingLifecycleSeam.summary.ok}`
      : "  ok: unknown (runtime.ping result unavailable)",
    runtimePingLifecycleSeam.summary
      ? `  workerState: ${runtimePingLifecycleSeam.summary.workerState}`
      : "  workerState: unavailable",
    runtimePingLifecycleSeam.summary
      ? `  healthState: ${runtimePingLifecycleSeam.summary.healthState}`
      : "  healthState: unavailable",
    runtimePingLifecycleSeam.summary
      ? `  phase: ${runtimePingLifecycleSeam.summary.phase}`
      : "  phase: unavailable",
    "  boundary: this seam checks compatibility runtime.ping only; it is not the Rust-hosted ask/explain/trace lifecycle envelope",
    "",
    "Capability state (compatibility Rust bridge query truth):",
    rustCapabilitySummary.available
      ? `  source: compatibility Rust bridge capability matrix`
      : "  source: compatibility Rust bridge capability matrix unavailable",
    rustCapabilitySummary.available
      ? `  supported: ${capabilityStateSummary.supported}`
      : `  reason: ${rustCapabilitySummary.reason}`,
    rustCapabilitySummary.available
      ? `  partial: ${capabilityStateSummary.partial}`
      : "  action: run a Rust-backed knowledge query (dh ask/dh explain) to surface capability details",
    rustCapabilitySummary.available
      ? `  best-effort: ${capabilityStateSummary.bestEffort}`
      : "  note: this compatibility surface is bounded and will not infer capability from TS extraction heuristics",
    rustCapabilitySummary.available
      ? `  unsupported: ${capabilityStateSummary.unsupported}`
      : "  unsupported: capability summary not reported on this surface",
    "",
    "Parser freshness (Rust engine status truth):",
    parserFreshnessSummary.available
      ? "  source: rust-engine status"
      : "  source: rust-engine status unavailable",
    parserFreshnessSummary.available
      ? `  condition: ${parserFreshnessSummary.summary.condition}`
      : `  reason: ${parserFreshnessSummary.reason}`,
    parserFreshnessSummary.available
      ? `  why: ${parserFreshnessSummary.summary.reason}`
      : "  action: run cargo run -q -p dh-engine -- status --workspace <repo> from rust-engine",
    parserFreshnessSummary.available
      ? `  counts: refreshed=${parserFreshnessSummary.summary.refreshedCurrentFiles} retained=${parserFreshnessSummary.summary.retainedCurrentFiles} degraded=${parserFreshnessSummary.summary.degradedPartialFiles} not_current=${parserFreshnessSummary.summary.notCurrentFiles}`
      : "  unsupported: parser freshness summary not reported on this surface",
    "",
    "Lifecycle classification:",
    `  install/distribution: ${installDistributionStatus}${installDistributionReasons.length > 0 ? ` — ${installDistributionReasons.join(" ")}` : ""}`,
    `  runtime/workspace readiness: ${runtimeWorkspaceReadinessStatus}${runtimeWorkspaceReasons.length > 0 ? ` — ${runtimeWorkspaceReasons.join(" ")}` : ""}`,
    `  capability/tooling: ${capabilityToolingStatus}${capabilityToolingReasons.length > 0 ? ` — ${capabilityToolingReasons.join(" ")}` : ""}`,
    `  overall lifecycle status: ${lifecycleStatus}`,
    "",
    "Hooks:",
    `  runtime binary: ${runtimeBinaryReady ? "yes" : "no"}`,
    `  sqlite bridge: ${sqliteBridgeReady ? "ready" : "not ready"}`,
    `  hook logs present: ${hookLogsPresent ? "yes" : "no"}`,
    "",
    `Status: ${operatorReadinessCondition === "ready" ? "OK (ready)" : operatorReadinessCondition === "ready-with-known-degradation" ? `DEGRADED (${lifecycleStatus})` : "BLOCKED"}`,
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
      runtimeBinaryReady,
      sqliteBridgeReady,
      hookLogsPresent,
    },
    diagnostics: {
      lifecycleClassification: {
        overall: lifecycleStatus,
        installDistribution: {
          status: installDistributionStatus,
          reasons: installDistributionReasons,
        },
        runtimeWorkspaceReadiness: {
          status: runtimeWorkspaceReadinessStatus,
          reasons: runtimeWorkspaceReasons,
        },
        capabilityTooling: {
          status: capabilityToolingStatus,
          reasons: capabilityToolingReasons,
        },
      },
      rustHostedKnowledgePath,
      runtimePingLifecycleSeam,
      capabilitySummary: rustCapabilitySummary,
      parserFreshnessSummary,
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
      lifecycleStatus,
      installDistributionStatus,
      runtimeWorkspaceReadinessStatus,
      capabilityToolingStatus,
      installDistributionReasons,
      runtimeWorkspaceReadinessReasons: runtimeWorkspaceReasons,
      capabilityToolingReasons,
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
      runtimeBinaryReady,
      sqliteBridgeReady,
      hookLogsPresent,
      workflowMirrorPresent: workflowMirrorExists,
      qualityGateContractVersion: qualityGateAvailability.contractVersion,
      qualityGateAvailableCount: qualityGateAvailability.summary.availableCount,
      qualityGateUnavailableCount: qualityGateAvailability.summary.unavailableCount,
      qualityGateNotConfiguredCount: qualityGateAvailability.summary.notConfiguredCount,
      ruleScanAvailability: qualityGateAvailability.gates.rule_scan.availability,
      securityScanAvailability: qualityGateAvailability.gates.security_scan.availability,
      rustHostedKnowledgePath,
      actionCount: actions.length,
      capabilitySummary: rustCapabilitySummary,
      parserFreshnessSummary,
      runtimePingLifecycleSeam,
      runtimePingLifecycleSeamState: runtimePingLifecycleSeam.state,
      capabilityStateSummary,
    },
  };
}

async function summarizeRustCapabilityState(repoRoot: string): Promise<RustCapabilitySummary> {
  const probe = await probeRustCapabilitySummary(repoRoot);
  if (!probe.ok) {
    return {
      source: "rust_bridge",
      available: false,
      reason: probe.unavailableReason,
    };
  }

  return {
    source: "rust_bridge",
    available: true,
    states: {
      supported: probe.summary.supported,
      partial: probe.summary.partial,
      bestEffort: probe.summary.bestEffort,
      unsupported: probe.summary.unsupported,
    },
    capabilityCount: probe.summary.capabilityCount,
  };
}

function summarizeRustHostedKnowledgePath(input: {
  workerBundlePath: string;
  workerManifestPath: string;
  flatWorkerBundlePath: string;
  flatWorkerManifestPath: string;
}): RustHostedKnowledgePathView {
  const workerBundleReady = fsSync.existsSync(input.workerBundlePath);
  const workerManifestReady = fsSync.existsSync(input.workerManifestPath);
  const flatWorkerBundleReady = fsSync.existsSync(input.flatWorkerBundlePath);
  const flatWorkerManifestReady = fsSync.existsSync(input.flatWorkerManifestPath);
  const flatReleaseAssetsReady = flatWorkerBundleReady && flatWorkerManifestReady;
  const reasons: string[] = [];

  if (!workerBundleReady) {
    reasons.push("Rust-hosted worker bundle is not present at dist/releases/ts-worker/worker.mjs.");
  }
  if (!workerManifestReady) {
    reasons.push("Rust-hosted worker manifest is not present at dist/releases/ts-worker/manifest.json.");
  }
  if (!flatReleaseAssetsReady) {
    reasons.push("Flat GitHub Release worker assets are not both present (dist/releases/worker.mjs and dist/releases/worker-manifest.json).");
  }

  return {
    source: "rust_host_lifecycle_authority",
    available: workerBundleReady && workerManifestReady,
    status: reasons.length === 0 ? "healthy" : "degraded",
    topology: "rust_host_ts_worker",
    supportBoundary: "knowledge_commands_first_wave",
    supportedCommands: ["ask", "explain", "trace"],
    buildEvidenceSupport: "bounded_rust_hosted_broad_ask_only",
    workerRole: "typescript_worker",
    legacyPathLabel: "legacy_ts_host_bridge_compatibility_only",
    targetPlatforms: ["linux", "macos"],
    workerBundleReady,
    workerManifestReady,
    flatReleaseAssetsReady,
    workerBundlePath: input.workerBundlePath,
    workerManifestPath: input.workerManifestPath,
    reasons,
  };
}

async function summarizeRuntimePingLifecycleSeam(repoRoot: string): Promise<RuntimePingLifecycleSeamView> {
  const bridgeClient = createDhJsonRpcStdioClient(repoRoot) as ReturnType<typeof createDhJsonRpcStdioClient> & {
    getRuntimePing?: () => Promise<RuntimeProbePingResult>;
  };
  try {
    if (!bridgeClient.getRuntimePing) {
      return {
        source: "runtime.ping",
        available: false,
        state: "unsupported",
        reason: "runtime.ping wrapper unavailable in bridge client",
      };
    }

    const runtimePing = await bridgeClient.getRuntimePing();
    const summary = summarizeRuntimePing(runtimePing);
    return {
      source: "runtime.ping",
      available: true,
      state: summary.state,
      reason: summary.reason,
      summary,
    };
  } catch (error) {
    const failure = classifyRuntimePingFailure(error);
    return {
      source: "runtime.ping",
      available: false,
      state: failure.state,
      reason: failure.reason,
    };
  } finally {
    await bridgeClient.close();
  }
}

function classifyRuntimePingFailure(error: unknown): { state: RustRuntimePingState; reason: string } {
  if (error instanceof DhBridgeError) {
    if (error.code === "BRIDGE_TIMEOUT" || error.code === "TIMEOUT") {
      return {
        state: "timed-out",
        reason: `${error.code} (${error.phase}) — ${error.message}`,
      };
    }

    if (error.code === "CAPABILITY_UNSUPPORTED" || error.code === "METHOD_NOT_SUPPORTED") {
      return {
        state: "unsupported",
        reason: `${error.code} (${error.phase}) — ${error.message}`,
      };
    }

    return {
      state: "unavailable/failed",
      reason: `${error.code} (${error.phase}) — ${error.message}`,
    };
  }

  if (error instanceof Error) {
    return {
      state: "unavailable/failed",
      reason: `REQUEST_FAILED (request) — ${error.message}`,
    };
  }

  return {
    state: "unavailable/failed",
    reason: "REQUEST_FAILED (request) — unknown runtime.ping lifecycle seam failure",
  };
}
