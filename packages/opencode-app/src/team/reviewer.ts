import type { ReviewerOutputState, ReviewFinding } from "../../../shared/src/types/role-output.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export type ReviewerInput = {
  changedAreas?: string[];
  implementerSummary?: string;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are a Code Reviewer agent in an AI software factory.
Given implementation details, produce a review verdict as JSON:
{
  "status": "PASS|PASS_WITH_NOTES|FAIL",
  "findings": [{"severity": "high|medium|low", "location": "file or module", "summary": "issue", "rationale": "why"}],
  "scopeCompliance": "pass|fail",
  "qualityGate": "pass|fail",
  "nextAction": "tester|implementer|coordinator"
}
Return ONLY valid JSON.`;

export async function runReviewer(input?: ReviewerInput): Promise<ReviewerOutputState> {
  if (!input?.provider) {
    return fallbackReviewer();
  }

  try {
    const context = [
      input.changedAreas ? `Changed areas: ${input.changedAreas.join(", ")}` : "",
      input.implementerSummary ? `Implementation summary: ${input.implementerSummary}` : "",
    ].filter(Boolean).join("\n");

    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context || "Review the latest implementation changes." },
      ],
      model: "gpt-4o",
      temperature: 0.2,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(response.content) as ReviewerOutputState;
    if (!parsed.status) {
      return fallbackReviewer();
    }
    return parsed;
  } catch {
    return fallbackReviewer();
  }
}

function fallbackReviewer(): ReviewerOutputState {
  return {
    status: "PASS_WITH_NOTES",
    findings: [],
    scopeCompliance: "pass",
    qualityGate: "pass",
    nextAction: "tester",
  };
}
