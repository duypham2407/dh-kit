import { describe, it, expect, afterEach } from "vitest";
import { runDoctor } from "./doctor.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { createConfigService } from "../../../opencode-app/src/config/config-service.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-doctor-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runDoctor", () => {
  it("returns ok and includes structured sections", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.ok).toBe(true);
    expect(report.summary).toContain("dh doctor");
    expect(report.summary).toContain("Operator summary:");
    expect(report.summary).toContain("surface: product/install/workspace health (dh doctor)");
    expect(report.summary).toContain("condition:");
    expect(report.summary).toContain("why:");
    expect(report.summary).toContain("works:");
    expect(report.summary).toContain("limited:");
    expect(report.summary).toContain("next:");
    expect(report.summary).toContain("Boundary:");
    expect(report.summary).toContain("Paths:");
    expect(report.summary).toContain("Database:");
    expect(report.summary).toContain("Providers:");
    expect(report.summary).toContain("Retrieval:");
    expect(report.summary).toContain("Workflow:");
    expect(report.summary).toContain("Verification health:");
    expect(report.summary).toContain("Lifecycle classification:");
    expect(report.summary).toContain("overall lifecycle status:");
    expect(report.summary).toContain("Hooks:");
    expect(report.summary).toContain("Status:");
  });

  it("reports chunk and embedding counts", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.summary).toContain("chunks: 0");
    expect(report.summary).toContain("embeddings: 0");
  });

  it("classifies lifecycle surfaces explicitly", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.summary).toContain("install/distribution:");
    expect(report.summary).toContain("runtime/workspace readiness:");
    expect(report.summary).toContain("capability/tooling:");
    expect(report.summary).toContain("overall lifecycle status:");

    expect(report.diagnostics.lifecycleClassification).toBeDefined();
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(
      report.diagnostics.lifecycleClassification.installDistribution.status,
    );
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(
      report.diagnostics.lifecycleClassification.runtimeWorkspaceReadiness.status,
    );
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(
      report.diagnostics.lifecycleClassification.capabilityTooling.status,
    );
  });

  it("uses ready, degraded, and blocked-facing condition labels", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.summary).toMatch(/condition: (ready|ready-with-known-degradation|blocked)/);
    expect(report.summary).toContain("Status:");
    expect(report.summary).toContain("this command reports product/install/workspace health only.");
    expect(report.summary).toContain("node .opencode/workflow-state.js status|show|show-policy-status|show-invocations|check-stage-readiness|resume-summary");
  });

  it("reports language support boundary summary", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.summary).toContain("Language support boundaries:");
    expect(report.summary).toContain("supported:");
    expect(report.summary).toContain("limited:");
    expect(report.summary).toContain("fallback-only:");

    expect(report.snapshot.languageSupportSummary.supported).toBeGreaterThan(0);
    expect(report.snapshot.languageSupportSummary.limited).toBeGreaterThan(0);
    expect(report.snapshot.languageSupportSummary.fallbackOnly).toBeGreaterThan(0);
    expect(report.snapshot.languageSupportBoundaries.length).toBeGreaterThan(0);
  });

  it("suggests running dh index when no chunks exist", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dh index"),
      ]),
    );
    expect(report.summary).toContain("Recommended actions:");
    expect(report.summary).toContain("dh index");
  });

  it("suggests setting API key when semantic mode is not off", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("OPENAI_API_KEY"),
      ]),
    );

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("respects stored embedding config overrides", async () => {
    const repo = makeTmpRepo();
    const svc = createConfigService(repo);
    svc.setEmbeddingConfig({ modelName: "custom-model-v2" });

    const report = await runDoctor(repo);

    expect(report.summary).toContain("custom-model-v2");
    // Should suggest the custom model is non-default
    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("custom-model-v2"),
      ]),
    );
  });

  it("notes when semantic mode is off", async () => {
    const repo = makeTmpRepo();
    const svc = createConfigService(repo);
    svc.setSemanticMode("off");

    const report = await runDoctor(repo);

    expect(report.summary).toContain("semantic mode: off");
    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dh config --semantic always"),
      ]),
    );
  });

  it("reports hook readiness structure", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.hookReadiness).toEqual({
      runtimeBinaryReady: false,
      sqliteBridgeReady: false,
      hookLogsPresent: false,
    });
  });

  it("produces a machine-readable snapshot", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    expect(report.snapshot).toBeDefined();
    expect(report.snapshot.timestamp).toBeTruthy();
    expect(report.snapshot.ok).toBe(true);
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(report.snapshot.lifecycleStatus);
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(report.snapshot.installDistributionStatus);
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(report.snapshot.runtimeWorkspaceReadinessStatus);
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(report.snapshot.capabilityToolingStatus);
    expect(Array.isArray(report.snapshot.installDistributionReasons)).toBe(true);
    expect(Array.isArray(report.snapshot.runtimeWorkspaceReadinessReasons)).toBe(true);
    expect(Array.isArray(report.snapshot.capabilityToolingReasons)).toBe(true);
    expect(report.snapshot.tables.required).toBeGreaterThan(0);
    expect(report.snapshot.tables.present).toBe(report.snapshot.tables.required);
    expect(report.snapshot.tables.missing).toEqual([]);
    expect(report.snapshot.chunks).toBe(0);
    expect(report.snapshot.embeddings).toBe(0);
    expect(report.snapshot.embeddingModel).toBe("text-embedding-3-small");
    expect(typeof report.snapshot.embeddingKeySet).toBe("boolean");
    expect(report.snapshot.semanticMode).toBe("always");
    expect(report.snapshot.providers).toBeGreaterThan(0);
    expect(report.snapshot.models).toBeGreaterThan(0);
    expect(report.snapshot.agents).toBeGreaterThan(0);
    expect(report.snapshot.runtimeBinaryReady).toBe(false);
    expect(report.snapshot.sqliteBridgeReady).toBe(false);
    expect(report.snapshot.hookLogsPresent).toBe(false);
    expect(typeof report.snapshot.workflowMirrorPresent).toBe("boolean");
    expect(report.snapshot.qualityGateContractVersion).toBe("v1");
    expect(typeof report.snapshot.qualityGateAvailableCount).toBe("number");
    expect(typeof report.snapshot.qualityGateUnavailableCount).toBe("number");
    expect(typeof report.snapshot.qualityGateNotConfiguredCount).toBe("number");
    expect(["available", "unavailable", "not_configured"]).toContain(report.snapshot.ruleScanAvailability);
    expect(["available", "unavailable", "not_configured"]).toContain(report.snapshot.securityScanAvailability);
    expect(typeof report.snapshot.actionCount).toBe("number");

    expect(report.diagnostics.lifecycleClassification).toBeDefined();
    expect(["healthy", "degraded", "unsupported", "misconfigured"]).toContain(report.diagnostics.lifecycleClassification.overall);
  });

  it("snapshot is JSON-serializable for CI consumption", async () => {
    const repo = makeTmpRepo();
    const report = await runDoctor(repo);

    const json = JSON.stringify(report.snapshot);
    const parsed = JSON.parse(json);

    expect(parsed.timestamp).toBe(report.snapshot.timestamp);
    expect(parsed.ok).toBe(report.snapshot.ok);
    expect(parsed.tables.required).toBe(report.snapshot.tables.required);
  });
});
