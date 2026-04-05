import type { CoordinatorOutputState } from "../../../shared/src/types/role-output.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export type CoordinatorInput = {
  lane: WorkflowLane;
  stage: string;
  objective: string;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are a Coordinator agent in an AI software factory.
You route work, confirm lanes, and identify blockers.
Given a lane, stage, and objective, produce JSON:
{
  "lane": "quick|delivery|migration",
  "stage": "current stage",
  "nextRole": "analyst|architect|implementer|reviewer|tester|quick|complete",
  "summary": "brief summary of routing decision",
  "handoffNotes": ["notes for the next role"],
  "blockers": ["any blockers or empty array"]
}
Return ONLY valid JSON.`;

export async function runCoordinator(input: CoordinatorInput): Promise<CoordinatorOutputState> {
  if (!input.provider) {
    return fallbackCoordinator(input);
  }

  try {
    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Lane: ${input.lane}\nStage: ${input.stage}\nObjective: ${input.objective}` },
      ],
      model: "gpt-4o",
      temperature: 0.2,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(response.content) as CoordinatorOutputState;
    if (!parsed.lane || !parsed.summary) {
      return fallbackCoordinator(input);
    }
    return parsed;
  } catch {
    return fallbackCoordinator(input);
  }
}

function fallbackCoordinator(input: CoordinatorInput): CoordinatorOutputState {
  return {
    lane: input.lane,
    stage: input.stage,
    nextRole: input.lane === "quick" ? "complete" : "analyst",
    summary: `Coordinator confirmed lane '${input.lane}' for objective '${input.objective}'.`,
    handoffNotes: ["Lane lock is active.", "Workflow can proceed to the next role."],
    blockers: [],
  };
}
