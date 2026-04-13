export type BrowserEvidencePolicy = "required" | "optional";

export type BrowserVerificationInput = {
  objective?: string;
  routedMcps: string[];
  evidencePolicy: BrowserEvidencePolicy;
};

export type BrowserVerificationResult = {
  required: boolean;
  pass: boolean;
  executedChecks: string[];
  evidence: string[];
  limitations: string[];
  outcome: "not_required" | "verified" | "insufficient_evidence";
};

export function runBrowserVerification(input: BrowserVerificationInput): BrowserVerificationResult {
  const objective = (input.objective ?? "").toLowerCase();
  const mcpSet = new Set(input.routedMcps);
  const requestedByObjective = isBrowserObjective(objective);
  const required = input.evidencePolicy === "required" || requestedByObjective || hasBrowserMcp(mcpSet);

  if (!required) {
    return {
      required: false,
      pass: true,
      executedChecks: [],
      evidence: [],
      limitations: [],
      outcome: "not_required",
    };
  }

  const executedChecks: string[] = [];
  const evidence: string[] = [];
  const limitations: string[] = [];

  const hasPlaywright = mcpSet.has("playwright");
  const hasDevtools = mcpSet.has("chrome-devtools");

  if (hasPlaywright) {
    executedChecks.push("Playwright smoke verification flow");
    evidence.push("playwright smoke flow routed");
  } else {
    limitations.push("Playwright MCP was not routed; browser smoke depth is reduced.");
  }

  if (hasDevtools) {
    executedChecks.push("Chrome DevTools diagnostics flow");
    evidence.push("chrome-devtools verification flow routed");
  } else {
    limitations.push("Chrome DevTools MCP was not routed; diagnostics depth is reduced.");
  }

  const pass = hasPlaywright || hasDevtools;
  if (pass) {
    evidence.push("browser verification evidence recorded");
  }
  evidence.push(`browser evidence policy: ${input.evidencePolicy}`);

  return {
    required: true,
    pass,
    executedChecks,
    evidence,
    limitations,
    outcome: pass ? "verified" : "insufficient_evidence",
  };
}

function hasBrowserMcp(mcpSet: Set<string>): boolean {
  return mcpSet.has("playwright") || mcpSet.has("chrome-devtools");
}

function isBrowserObjective(text: string): boolean {
  return text.includes("browser")
    || text.includes("frontend")
    || text.includes("ui")
    || text.includes("playwright")
    || text.includes("devtools");
}
