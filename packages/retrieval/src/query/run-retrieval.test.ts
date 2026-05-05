import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "../../../shared/src/utils/ids.js";
import { runRetrieval } from "./run-retrieval.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { buildEvidencePackets } from "./build-evidence-packets.js";
import { readTelemetryEvents } from "../semantic/telemetry-collector.js";
import { GRAPH_AST_ENGINE_ENV_VAR } from "../../../shared/src/utils/graph-engine-selector.js";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGraphAstEngine = process.env[GRAPH_AST_ENGINE_ENV_VAR];
let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-retrieval-run-test-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
  if (originalGraphAstEngine === undefined) {
    delete process.env[GRAPH_AST_ENGINE_ENV_VAR];
  } else {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = originalGraphAstEngine;
  }
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runRetrieval", () => {
  it("keeps retrieval-local evidence packets as non-authoritative compatibility output", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "find login definition",
      mode: "ask",
      semanticMode: "off",
    });

    expect(result.evidencePackets.length).toBeGreaterThan(0);
    // Guardrail: retrieval packets are compatibility artifacts, not product authority.
    expect(result.evidencePackets[0]?.sourceTools.length ?? 0).toBeGreaterThan(0);
  });

  it("returns retrieval evidence with semantic mode off", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "find login definition",
      mode: "ask",
      semanticMode: "off",
    });

    expect(result.plan.semanticMode).toBe("off");
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.evidencePackets.length).toBeGreaterThan(0);
    expect(result.scanMeta.reducedCoverage).toBe(false);
  });

  it("does not run legacy TypeScript graph extraction when dependency graph is unavailable", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "dashboard.ts"), "import { login } from './auth';\nexport function dashboard() { return login(); }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "explain auth module",
      mode: "explain",
      semanticMode: "off",
    });

    expect(result.dependencyGraph).toMatchObject({
      available: false,
      reason: "rust_bridge_api_not_available_at_retrieval_boundary",
      source: "degraded_unavailable_adapter",
      runtimeBehavior: "rust_first_unavailable",
      engineSelector: {
        engine: "rust",
        label: "default_rust",
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toHaveLength(0);
    expect(result.results.length).toBeGreaterThan(0);

    const telemetryEvents = readTelemetryEvents(repo);
    expect(telemetryEvents.some((event) => event.kind === "retrieval_dependency_graph_unavailable")).toBe(true);
    expect(telemetryEvents.some((event) => event.kind === "retrieval_dependency_graph_unavailable" && event.details["selectorLabel"] === "default_rust")).toBe(true);
  });

  it("labels ts selector as rollback-only and does not run legacy TypeScript graph extraction", async () => {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = "ts";
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "explain auth module",
      mode: "explain",
      semanticMode: "off",
    });

    expect(result.dependencyGraph).toMatchObject({
      available: false,
      degraded: true,
      reason: "ts_graph_engine_requires_explicit_rollback_rehearsal_context",
      runtimeBehavior: "ts_rollback_context_required",
      engineSelector: {
        engine: "ts",
        label: "explicit_ts_rollback_only",
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toHaveLength(0);

    const telemetryEvents = readTelemetryEvents(repo);
    expect(telemetryEvents.some((event) => event.kind === "retrieval_dependency_graph_unavailable" && event.details["runtimeBehavior"] === "ts_rollback_context_required")).toBe(true);
  });

  it("runs semantic retrieval path in always mode", async () => {
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "ui.ts"), "export function renderUI() { return 'ui'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "frontend ui render",
      mode: "explain",
      semanticMode: "always",
    });

    expect(result.plan.semanticMode).toBe("always");
    expect(result.embeddingStats).toBeDefined();
    expect(result.evidencePackets.length).toBeGreaterThan(0);
    expect(result.results.every((entry) => !path.isAbsolute(entry.filePath))).toBe(true);
  });

  it("surfaces reduced coverage metadata when scan is partial", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export const b = 1;\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "find a",
      mode: "ask",
      semanticMode: "off",
      scanOptions: { maxFiles: 1 },
    });

    expect(result.scanMeta.reducedCoverage).toBe(true);
    expect(result.scanMeta.stopReasons).toContain("max_files_reached");
  });

  it("emits repo-relative result file paths for segmented workspace files", async () => {
    const repo = makeTmpRepo();
    const workspaceRoot = path.join(repo, "packages", "api");
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "package.json"), "{}\n", "utf8");
    fs.writeFileSync(path.join(workspaceRoot, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const result = await runRetrieval({
      repoRoot: repo,
      query: "login",
      mode: "ask",
      semanticMode: "off",
    });

    const authResult = result.results.find((entry) => entry.filePath.endsWith("packages/api/src/auth.ts"));
    expect(authResult).toBeDefined();
    expect(authResult!.filePath).toBe("packages/api/src/auth.ts");
  });

  it("buildEvidencePackets can read segmented repo-relative file paths", async () => {
    const repo = makeTmpRepo();
    const workspaceRoot = path.join(repo, "packages", "api");
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const packets = await buildEvidencePackets(repo, [{
      entityType: "file",
      entityId: createId("result"),
      filePath: "packages/api/src/auth.ts",
      lineRange: [1, 10],
      sourceTool: "keyword_search",
      matchReason: "segmented path",
      rawScore: 0.5,
      normalizedScore: 0.7,
      metadata: {},
    }]);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.snippet).not.toBe("Snippet unavailable.");
  });

});
