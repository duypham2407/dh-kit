import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

import {
  buildWorkflowQualityGateReport,
  getQualityGateAvailabilitySnapshot,
  normalizeBrowserVerificationResult,
  normalizeStructuralEvidenceResult,
} from "./quality-gates-runtime.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-quality-gates-runtime-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  return repo;
}

function semgrepProbeResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: null,
    signal: null,
    error: undefined,
    output: [null, null, null],
    pid: 123,
    stdout: null,
    stderr: null,
    ...overrides,
  };
}

function semgrepLaunchError(code: string): Error & { code: string } {
  return Object.assign(new Error(`spawn semgrep ${code}`), { code });
}

function expectBoundedSemgrepProbe(): void {
  const lastCall = spawnSyncMock.mock.calls[spawnSyncMock.mock.calls.length - 1];
  expect(lastCall).toBeDefined();
  expect(lastCall?.[0]).toBe("semgrep");
  expect(lastCall?.[1]).toEqual(["--version"]);

  const options = lastCall?.[2] as { stdio?: string; timeout?: number } | undefined;
  expect(options).toEqual(expect.objectContaining({
    killSignal: "SIGKILL",
    stdio: "ignore",
    timeout: expect.any(Number),
  }));
  expect(options?.timeout).toBeGreaterThan(0);
}

describe("quality-gates runtime", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue(semgrepProbeResult({
      error: semgrepLaunchError("ENOENT"),
    }));
  });

  it("models rule_scan and security_scan as not_configured when configs are absent", () => {
    const repo = makeRepo();
    const snapshot = getQualityGateAvailabilitySnapshot(repo);

    expect(snapshot.contractVersion).toBe("v1");
    expect(snapshot.catalog).toHaveLength(6);
    expect(snapshot.gates.rule_scan.availability).toBe("not_configured");
    expect(snapshot.gates.security_scan.availability).toBe("not_configured");
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it("marks rule_scan unavailable when configured but semgrep CLI is not detected", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, ".semgrep.yml"), "rules: []\n", "utf8");

    const snapshot = getQualityGateAvailabilitySnapshot(repo);
    expect(snapshot.gates.rule_scan.availability).toBe("unavailable");
    expectBoundedSemgrepProbe();
  });

  it("marks rule_scan available when the bounded Semgrep probe succeeds", () => {
    spawnSyncMock.mockReturnValueOnce(semgrepProbeResult({ status: 0 }));

    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, ".semgrep.yml"), "rules: []\n", "utf8");

    const snapshot = getQualityGateAvailabilitySnapshot(repo);
    expect(snapshot.gates.rule_scan.availability).toBe("available");
    expectBoundedSemgrepProbe();
  });

  it("marks rule_scan unavailable when the bounded Semgrep probe times out", () => {
    spawnSyncMock.mockReturnValueOnce(semgrepProbeResult({
      status: 0,
      signal: "SIGTERM",
      error: semgrepLaunchError("ETIMEDOUT"),
    }));

    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, ".semgrep.yml"), "rules: []\n", "utf8");

    const snapshot = getQualityGateAvailabilitySnapshot(repo);
    expect(snapshot.gates.rule_scan.availability).toBe("unavailable");
    expectBoundedSemgrepProbe();
  });

  it("marks rule_scan unavailable when Semgrep exits non-zero", () => {
    spawnSyncMock.mockReturnValueOnce(semgrepProbeResult({ status: 2 }));

    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, ".semgrep.yml"), "rules: []\n", "utf8");

    const snapshot = getQualityGateAvailabilitySnapshot(repo);
    expect(snapshot.gates.rule_scan.availability).toBe("unavailable");
    expectBoundedSemgrepProbe();
  });

  it("marks rule_scan unavailable when Semgrep launch throws", () => {
    spawnSyncMock.mockImplementationOnce(() => {
      throw semgrepLaunchError("EACCES");
    });

    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, ".semgrep.yml"), "rules: []\n", "utf8");

    const snapshot = getQualityGateAvailabilitySnapshot(repo);
    expect(snapshot.gates.rule_scan.availability).toBe("unavailable");
    expectBoundedSemgrepProbe();
  });

  it("normalizes structural evidence and browser verification results", () => {
    const structural = normalizeStructuralEvidenceResult({
      evaluated: true,
      allowed: false,
      reason: "Missing structural graph-tool evidence for intent.",
      suggestion: "Run dh.find-references before reporting usages.",
      toolsUsed: ["grep"],
      evidenceScore: 0.2,
    });
    const browser = normalizeBrowserVerificationResult({
      required: true,
      pass: true,
      executedChecks: ["Playwright smoke verification flow"],
      evidence: ["browser verification evidence recorded"],
      limitations: [],
    });

    expect(structural.gateId).toBe("structural_evidence");
    expect(structural.status).toBe("fail");
    expect(browser.gateId).toBe("browser_verification");
    expect(browser.status).toBe("pass");

    const failedBrowser = normalizeBrowserVerificationResult({
      required: true,
      pass: false,
      executedChecks: [],
      evidence: ["browser evidence policy: required"],
      limitations: ["No routed browser MCP"],
    });
    expect(failedBrowser.status).toBe("fail");
  });

  it("builds aggregated workflow quality-gate report for delivery lane", () => {
    const repo = makeRepo();
    const report = buildWorkflowQualityGateReport({
      repoRoot: repo,
      lane: "delivery",
      workflowGate: {
        pass: true,
        reason: "Delivery review and verification gates passed across all work items.",
      },
      localVerification: {
        pass: true,
        reason: "Tester evidence recorded for all delivery work items.",
        evidence: ["verification gate evidence recorded"],
        limitations: [],
      },
      structuralEvidence: {
        evaluated: false,
      },
      browserVerification: {
        required: true,
        pass: true,
        executedChecks: ["Playwright smoke verification flow"],
        evidence: ["browser verification evidence recorded"],
        limitations: [],
      },
    });

    expect(report.contractVersion).toBe("v1");
    expect(report.results.map((result) => result.gateId)).toEqual([
      "rule_scan",
      "security_scan",
      "workflow_gate",
      "local_verification",
      "structural_evidence",
      "browser_verification",
    ]);
    expect(report.summary.passCount).toBeGreaterThanOrEqual(3);
    expect(report.summary.notConfiguredCount).toBeGreaterThanOrEqual(2);
  });
});
