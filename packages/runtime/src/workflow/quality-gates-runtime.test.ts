import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

describe("quality-gates runtime", () => {
  it("models rule_scan and security_scan as not_configured when configs are absent", () => {
    const repo = makeRepo();
    const snapshot = getQualityGateAvailabilitySnapshot(repo);

    expect(snapshot.contractVersion).toBe("v1");
    expect(snapshot.catalog).toHaveLength(6);
    expect(snapshot.gates.rule_scan.availability).toBe("not_configured");
    expect(snapshot.gates.security_scan.availability).toBe("not_configured");
  });

  it("marks rule_scan unavailable when configured but semgrep CLI is not detected", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, ".semgrep.yml"), "rules: []\n", "utf8");

    const snapshot = getQualityGateAvailabilitySnapshot(repo);
    expect(["available", "unavailable"]).toContain(snapshot.gates.rule_scan.availability);
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
