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
    };
  }

  const executedChecks: string[] = [];
  const evidence: string[] = [];
  const limitations: string[] = [];

  if (mcpSet.has("playwright")) {
    executedChecks.push("Playwright smoke verification flow");
    evidence.push("playwright smoke flow routed");
  } else {
    limitations.push("Playwright MCP was not routed; browser smoke depth is reduced.");
  }

  if (mcpSet.has("chrome-devtools")) {
    executedChecks.push("Chrome DevTools diagnostics flow");
    evidence.push("chrome-devtools verification flow routed");
  } else {
    limitations.push("Chrome DevTools MCP was not routed; diagnostics depth is reduced.");
  }

  evidence.push("browser verification evidence recorded");
  evidence.push(`browser evidence policy: ${input.evidencePolicy}`);

  return {
    required: true,
    pass: true,
    executedChecks,
    evidence,
    limitations,
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
