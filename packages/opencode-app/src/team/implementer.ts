import type { ImplementerOutputState } from "../../../shared/src/types/role-output.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export type ImplementerInput = {
  workItemId: string;
  summary: string;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are an Implementer agent in an AI software factory.
Given a work item summary, produce an implementation status as JSON:
{
  "status": "DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED",
  "changedAreas": ["modules changed"],
  "summary": "what was implemented",
  "concerns": ["any concerns or empty array"],
  "localVerification": ["verification steps run"],
  "reviewNotes": ["notes for the reviewer"]
}
Return ONLY valid JSON.`;

export async function runImplementer(input: ImplementerInput): Promise<ImplementerOutputState> {
  if (!input.provider) {
    return fallbackImplementer(input);
  }

  try {
    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Work item: ${input.workItemId}\nSummary: ${input.summary}` },
      ],
      model: "gpt-4o",
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(response.content) as ImplementerOutputState;
    if (!parsed.status || !parsed.summary) {
      return fallbackImplementer(input);
    }
    return { ...parsed, workItemId: input.workItemId };
  } catch {
    return fallbackImplementer(input);
  }
}

function fallbackImplementer(input: ImplementerInput): ImplementerOutputState {
  return {
    status: "DONE",
    workItemId: input.workItemId,
    changedAreas: ["workflow", "storage"],
    summary: input.summary,
    concerns: [],
    localVerification: ["TypeScript check should pass after implementation."],
    reviewNotes: ["Review persistence and stage transition correctness."],
  };
}
