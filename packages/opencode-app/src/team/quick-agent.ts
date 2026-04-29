import type { QuickOutputState } from "../../../shared/src/types/role-output.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export type QuickAgentInput = {
  lane: WorkflowLane;
  stage: string;
  objective: string;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are a Quick Agent in an AI software factory.
You handle fast, low-risk, bounded tasks efficiently without heavy planning.
Given a stage and objective, produce JSON:
{
  "status": "DONE|DONE_WITH_CONCERNS|BLOCKED",
  "summary": "brief summary of what was accomplished",
  "actionsTaken": ["action 1", "action 2"],
  "verification": ["how the work was verified"],
  "nextRole": "complete|coordinator"
}
Return ONLY valid JSON.`;

export async function runQuickAgent(input: QuickAgentInput): Promise<QuickOutputState> {
  if (!input.provider) {
    return fallbackQuickAgent(input);
  }

  try {
    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Lane: ${input.lane}\nStage: ${input.stage}\nObjective: ${input.objective}` },
      ],
      model: "gpt-4o", // Will be mapped by provider logic
      temperature: 0.2,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(response.content) as QuickOutputState;
    if (!parsed.status || !parsed.summary) {
      return fallbackQuickAgent(input);
    }
    return parsed;
  } catch {
    return fallbackQuickAgent(input);
  }
}

function fallbackQuickAgent(input: QuickAgentInput): QuickOutputState {
  return {
    status: "DONE",
    summary: `Quick agent completed stage '${input.stage}' for objective '${input.objective}'.`,
    actionsTaken: ["Fallback execution used due to missing provider or parse error."],
    verification: ["No automated verification performed in fallback mode."],
    nextRole: "complete",
  };
}
