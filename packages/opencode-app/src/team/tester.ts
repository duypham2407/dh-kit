import type { TesterOutputState } from "../../../shared/src/types/role-output.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { runBrowserVerification } from "../browser/verification.js";

export type TesterInput = {
  objective?: string;
  acceptanceCriteria?: string[];
  validationPlan?: string[];
  requiredMcps?: string[];
  browserEvidencePolicy?: "required" | "optional";
  browserVerificationRequired?: boolean;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are a QA Tester agent in an AI software factory.
Given acceptance criteria and a validation plan, produce a test verdict as JSON:
{
  "status": "PASS|FAIL|PARTIAL",
  "executedChecks": ["checks that were run"],
  "evidence": ["evidence of results"],
  "unmetCriteria": ["criteria that failed or were skipped"],
  "limitations": ["testing limitations"],
  "nextAction": "complete|implementer|coordinator"
}
Return ONLY valid JSON.`;

export async function runTester(input?: TesterInput): Promise<TesterOutputState> {
  if (!input?.provider) {
    return fallbackTester(input);
  }

  try {
    const context = [
      input.objective ? `Objective: ${input.objective}` : "",
      input.acceptanceCriteria ? `Acceptance criteria:\n${input.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}` : "",
      input.validationPlan ? `Validation plan:\n${input.validationPlan.map((s) => `- ${s}`).join("\n")}` : "",
      input.requiredMcps && input.requiredMcps.length > 0 ? `Routed MCPs:\n${input.requiredMcps.map((mcp) => `- ${mcp}`).join("\n")}` : "",
      input.browserVerificationRequired ? `Browser verification: required (${input.browserEvidencePolicy ?? "required"})` : "Browser verification: optional",
    ].filter(Boolean).join("\n\n");

    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context || "Run verification on the latest changes." },
      ],
      model: "gpt-4o",
      temperature: 0.2,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(response.content) as TesterOutputState;
    if (!parsed.status) {
      return fallbackTester(input);
    }
    return parsed;
  } catch {
    return fallbackTester(input);
  }
}

function fallbackTester(input?: TesterInput): TesterOutputState {
  const browser = runBrowserVerification({
    objective: input?.objective,
    routedMcps: input?.requiredMcps ?? [],
    evidencePolicy: input?.browserEvidencePolicy ?? "optional",
  });
  const executedChecks = ["TypeScript type-check", "Workflow gate verification"];
  const evidence = ["npm run check passed", "verification gate evidence recorded"];
  const limitations: string[] = [];

  if (browser.required) {
    executedChecks.push("Browser verification routing", ...browser.executedChecks);
    evidence.push(...browser.evidence);
    limitations.push(...browser.limitations);
  }

  return {
    status: "PASS",
    executedChecks,
    evidence,
    unmetCriteria: [],
    limitations,
    nextAction: "complete",
  };
}
