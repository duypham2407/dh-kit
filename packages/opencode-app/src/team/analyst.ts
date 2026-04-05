import type { AnalystOutputState } from "../../../shared/src/types/role-output.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export type AnalystInput = {
  objective: string;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are a Product Analyst agent in an AI software factory.
Given a user objective, produce a structured analysis with these exact JSON fields:
{
  "problemStatement": "restate the objective as a clear problem",
  "scope": ["what is in scope"],
  "outOfScope": ["what is explicitly excluded"],
  "assumptions": ["key assumptions"],
  "constraints": ["technical or process constraints"],
  "acceptanceCriteria": ["measurable acceptance criteria"],
  "risks": ["identified risks"],
  "recommendedNextRole": "architect"
}
Return ONLY valid JSON. No markdown fences.`;

export async function runAnalyst(input: AnalystInput): Promise<AnalystOutputState> {
  if (!input.provider) {
    return fallbackAnalyst(input.objective);
  }

  try {
    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input.objective },
      ],
      model: "gpt-4o",
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(response.content) as AnalystOutputState;
    if (!parsed.problemStatement || !Array.isArray(parsed.scope)) {
      return fallbackAnalyst(input.objective);
    }
    return parsed;
  } catch {
    return fallbackAnalyst(input.objective);
  }
}

function fallbackAnalyst(objective: string): AnalystOutputState {
  return {
    problemStatement: objective,
    scope: [objective],
    outOfScope: [],
    assumptions: ["Current implementation should stay aligned with architecture docs."],
    constraints: ["Work must preserve lane contracts and runtime discipline."],
    acceptanceCriteria: ["Implementation matches the current roadmap phase goals."],
    risks: [],
    recommendedNextRole: "architect",
  };
}
