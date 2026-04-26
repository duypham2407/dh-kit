import fsSync from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const QUALITY_GATE_RUNTIME_CONTRACT_VERSION = "v1" as const;

const SEMGREP_CLI_DETECTION_TIMEOUT_MS = 5_000;

export const QUALITY_GATE_CATALOG = [
  "rule_scan",
  "security_scan",
  "workflow_gate",
  "local_verification",
  "structural_evidence",
  "browser_verification",
] as const;

export type QualityGateId = typeof QUALITY_GATE_CATALOG[number];

export type QualityGateAvailability = "available" | "unavailable" | "not_configured";

export type QualityGateResultStatus = "pass" | "fail" | "not_run";

export type QualityGateAvailabilityRecord = {
  gateId: QualityGateId;
  availability: QualityGateAvailability;
  reason: string;
};

export type QualityGateResult = {
  gateId: QualityGateId;
  status: QualityGateResultStatus;
  reason: string;
  evidence: string[];
  limitations: string[];
};

export type QualityGateAvailabilitySnapshot = {
  contractVersion: typeof QUALITY_GATE_RUNTIME_CONTRACT_VERSION;
  catalog: readonly QualityGateId[];
  gates: Record<QualityGateId, QualityGateAvailabilityRecord>;
  summary: {
    availableCount: number;
    unavailableCount: number;
    notConfiguredCount: number;
  };
};

export type WorkflowQualityGateReport = {
  contractVersion: typeof QUALITY_GATE_RUNTIME_CONTRACT_VERSION;
  lane: "quick" | "delivery" | "migration";
  availability: QualityGateAvailabilitySnapshot;
  results: QualityGateResult[];
  summary: {
    passCount: number;
    failCount: number;
    notRunCount: number;
    unavailableCount: number;
    notConfiguredCount: number;
  };
};

export function getQualityGateAvailabilitySnapshot(repoRoot: string): QualityGateAvailabilitySnapshot {
  const gates: Record<QualityGateId, QualityGateAvailabilityRecord> = {
    rule_scan: resolveRuleScanAvailability(repoRoot),
    security_scan: resolveSecurityScanAvailability(repoRoot),
    workflow_gate: {
      gateId: "workflow_gate",
      availability: "available",
      reason: "Workflow stage gate evaluator is available.",
    },
    local_verification: {
      gateId: "local_verification",
      availability: "available",
      reason: "Local verification evidence surface is available.",
    },
    structural_evidence: {
      gateId: "structural_evidence",
      availability: "available",
      reason: "Structural evidence hook surface is available.",
    },
    browser_verification: {
      gateId: "browser_verification",
      availability: "available",
      reason: "Browser verification normalization surface is available.",
    },
  };

  const summary = {
    availableCount: 0,
    unavailableCount: 0,
    notConfiguredCount: 0,
  };

  for (const gateId of QUALITY_GATE_CATALOG) {
    const availability = gates[gateId].availability;
    if (availability === "available") {
      summary.availableCount += 1;
    } else if (availability === "unavailable") {
      summary.unavailableCount += 1;
    } else {
      summary.notConfiguredCount += 1;
    }
  }

  return {
    contractVersion: QUALITY_GATE_RUNTIME_CONTRACT_VERSION,
    catalog: QUALITY_GATE_CATALOG,
    gates,
    summary,
  };
}

export function normalizeStructuralEvidenceResult(input: {
  evaluated: boolean;
  allowed?: boolean;
  reason?: string;
  suggestion?: string;
  toolsUsed?: string[];
  evidenceScore?: number;
}): QualityGateResult {
  if (!input.evaluated) {
    return {
      gateId: "structural_evidence",
      status: "not_run",
      reason: "Structural evidence gate was not evaluated in this workflow run.",
      evidence: [],
      limitations: [],
    };
  }

  const toolEvidence = input.toolsUsed?.length
    ? [`tools used: ${input.toolsUsed.join(", ")}`]
    : [];
  const scoreEvidence = typeof input.evidenceScore === "number"
    ? [`evidence score: ${input.evidenceScore.toFixed(2)}`]
    : [];

  return {
    gateId: "structural_evidence",
    status: input.allowed ? "pass" : "fail",
    reason: input.reason ?? (input.allowed ? "Structural evidence gate passed." : "Structural evidence gate failed."),
    evidence: [...toolEvidence, ...scoreEvidence],
    limitations: input.allowed ? [] : (input.suggestion ? [input.suggestion] : []),
  };
}

export function normalizeBrowserVerificationResult(input: {
  required: boolean;
  pass: boolean;
  executedChecks: string[];
  evidence: string[];
  limitations: string[];
}): QualityGateResult {
  if (!input.required) {
    return {
      gateId: "browser_verification",
      status: "not_run",
      reason: "Browser verification was not required for this objective.",
      evidence: [],
      limitations: [],
    };
  }

  return {
    gateId: "browser_verification",
    status: input.pass ? "pass" : "fail",
    reason: input.pass ? "Browser verification requirement satisfied." : "Browser verification requirement did not pass.",
    evidence: [...input.executedChecks, ...input.evidence],
    limitations: input.limitations,
  };
}

export function buildWorkflowQualityGateReport(input: {
  repoRoot: string;
  lane: "quick" | "delivery" | "migration";
  workflowGate: {
    pass: boolean;
    reason: string;
  };
  localVerification: {
    pass: boolean;
    reason: string;
    evidence?: string[];
    limitations?: string[];
  };
  structuralEvidence?: {
    evaluated: boolean;
    allowed?: boolean;
    reason?: string;
    suggestion?: string;
    toolsUsed?: string[];
    evidenceScore?: number;
  };
  browserVerification: {
    required: boolean;
    pass: boolean;
    executedChecks: string[];
    evidence: string[];
    limitations: string[];
  };
}): WorkflowQualityGateReport {
  const availability = getQualityGateAvailabilitySnapshot(input.repoRoot);

  const results: QualityGateResult[] = [
    normalizeRuleGateResult("rule_scan", availability.gates.rule_scan),
    normalizeRuleGateResult("security_scan", availability.gates.security_scan),
    {
      gateId: "workflow_gate",
      status: input.workflowGate.pass ? "pass" : "fail",
      reason: input.workflowGate.reason,
      evidence: [
        `lane: ${input.lane}`,
      ],
      limitations: [],
    },
    {
      gateId: "local_verification",
      status: input.localVerification.pass ? "pass" : "fail",
      reason: input.localVerification.reason,
      evidence: input.localVerification.evidence ?? [],
      limitations: input.localVerification.limitations ?? [],
    },
    normalizeStructuralEvidenceResult(input.structuralEvidence ?? { evaluated: false }),
    normalizeBrowserVerificationResult(input.browserVerification),
  ];

  const summary = {
    passCount: results.filter((result) => result.status === "pass").length,
    failCount: results.filter((result) => result.status === "fail").length,
    notRunCount: results.filter((result) => result.status === "not_run").length,
    unavailableCount: availability.summary.unavailableCount,
    notConfiguredCount: availability.summary.notConfiguredCount,
  };

  return {
    contractVersion: QUALITY_GATE_RUNTIME_CONTRACT_VERSION,
    lane: input.lane,
    availability,
    results,
    summary,
  };
}

function normalizeRuleGateResult(
  gateId: "rule_scan" | "security_scan",
  availability: QualityGateAvailabilityRecord,
): QualityGateResult {
  if (availability.availability !== "available") {
    return {
      gateId,
      status: "not_run",
      reason: availability.reason,
      evidence: [],
      limitations: ["Verification gate is not executable in this runtime."],
    };
  }

  return {
    gateId,
    status: "not_run",
    reason: `${gateId} is available but was not executed in this workflow path.`,
    evidence: [],
    limitations: ["No local execution bridge wired for this workflow lane."],
  };
}

function resolveRuleScanAvailability(repoRoot: string): QualityGateAvailabilityRecord {
  const semgrepConfigPaths = [
    ".semgrep.yml",
    ".semgrep.yaml",
    "semgrep.yml",
    "semgrep.yaml",
  ];
  const configured = semgrepConfigPaths.some((relativePath) => {
    return fsSync.existsSync(path.join(repoRoot, relativePath));
  });

  if (!configured) {
    return {
      gateId: "rule_scan",
      availability: "not_configured",
      reason: "Semgrep configuration was not found (.semgrep.yml/.semgrep.yaml).",
    };
  }

  const semgrepDetected = detectSemgrepCli();
  if (!semgrepDetected) {
    return {
      gateId: "rule_scan",
      availability: "unavailable",
      reason: "Semgrep configuration exists but Semgrep CLI was not detected on host PATH.",
    };
  }

  return {
    gateId: "rule_scan",
    availability: "available",
    reason: "Semgrep configuration and Semgrep CLI are present; in-process gate execution bridge remains additive and lane-owned.",
  };
}

function resolveSecurityScanAvailability(repoRoot: string): QualityGateAvailabilityRecord {
  const securityConfigPaths = [
    ".dh/security-scan.json",
    ".dh/security-rules.json",
    ".semgrep/security.yml",
    ".semgrep/security.yaml",
  ];
  const configured = securityConfigPaths.some((relativePath) => {
    return fsSync.existsSync(path.join(repoRoot, relativePath));
  });

  if (!configured) {
    return {
      gateId: "security_scan",
      availability: "not_configured",
      reason: "Security scan configuration was not found in expected runtime paths.",
    };
  }

  return {
    gateId: "security_scan",
    availability: "unavailable",
    reason: "Security scan configuration exists but in-process security_scan execution bridge is not installed.",
  };
}

function detectSemgrepCli(): boolean {
  try {
    const result = spawnSync("semgrep", ["--version"], {
      killSignal: "SIGKILL",
      stdio: "ignore",
      timeout: SEMGREP_CLI_DETECTION_TIMEOUT_MS,
    });
    return result.status === 0 && !result.error && result.signal === null;
  } catch {
    return false;
  }
}
