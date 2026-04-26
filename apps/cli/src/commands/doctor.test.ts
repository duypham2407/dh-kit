import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctorCommand } from "./doctor.js";
import { closeDhDatabase } from "../../../../packages/storage/src/sqlite/db.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-doctor-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runDoctorCommand", () => {
  it("prints machine-readable doctor output with --json", async () => {
    const repo = makeTmpRepo();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runDoctorCommand(repo, ["--json"]);

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0] ?? "{}"));
    expect(payload.ok).toBe(true);
    expect(payload.summary).toContain("dh doctor");
    expect(payload.hookReadiness).toEqual({
      runtimeBinaryReady: false,
      sqliteBridgeReady: false,
      hookLogsPresent: false,
    });
    expect(payload.diagnostics.providerCoverage.totalProviders).toBeGreaterThan(0);
    expect(payload.diagnostics.providerCoverage.totalModels).toBeGreaterThan(0);
    expect(payload.diagnostics.rustHostedKnowledgePath).toMatchObject({
      source: "rust_host_lifecycle_authority",
      topology: "rust_host_ts_worker",
      supportBoundary: "knowledge_commands_first_wave",
      workerRole: "typescript_worker",
      legacyPathLabel: "legacy_ts_host_bridge_compatibility_only",
      buildEvidenceSupport: "bounded_rust_hosted_broad_ask_only",
      targetPlatforms: ["linux", "macos"],
    });
    expect(payload.diagnostics.rustHostedKnowledgePath.supportedCommands).toEqual(["ask", "explain", "trace"]);
    expect(payload.diagnostics.capabilitySummary).toBeDefined();
    expect(payload.diagnostics.parserFreshnessSummary).toBeDefined();
    expect(payload.diagnostics.runtimePingLifecycleSeam).toBeDefined();
    expect(payload.diagnostics.runtimePingLifecycleSeam.source).toBe("runtime.ping");
    expect(payload.snapshot.rustHostedKnowledgePath).toBeDefined();
    expect(payload.snapshot.rustHostedKnowledgePath.legacyPathLabel).toBe("legacy_ts_host_bridge_compatibility_only");
    expect(typeof payload.snapshot.rustHostedKnowledgePath.workerBundleReady).toBe("boolean");
    expect(typeof payload.snapshot.rustHostedKnowledgePath.workerManifestReady).toBe("boolean");
    expect(payload.snapshot.capabilitySummary).toBeDefined();
    expect(payload.snapshot.parserFreshnessSummary).toBeDefined();
    expect(payload.snapshot.runtimePingLifecycleSeam).toBeDefined();
    expect(payload.snapshot.runtimePingLifecycleSeamState).toBeDefined();
    expect(payload.snapshot.capabilityStateSummary).toBeDefined();
    expect(payload.debugDumpPath).toBeUndefined();
  });

  it("includes written debug dump path in --json output", async () => {
    const repo = makeTmpRepo();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const dumpPath = path.join(repo, ".dh", "custom-debug.json");

    const exitCode = await runDoctorCommand(repo, ["--json", "--debug-dump", dumpPath]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(dumpPath)).toBe(true);

    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0] ?? "{}"));
    expect(payload.debugDumpPath).toBe(dumpPath);
    expect(payload.ok).toBe(true);
  });
});
