import type { ArchitectOutputState } from "../../../shared/src/types/role-output.js";
import type { WorkItemState } from "../../../shared/src/types/work-item.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { createId } from "../../../shared/src/utils/ids.js";

export type ArchitectInput = {
  sessionId: string;
  lane: "delivery" | "migration";
  objective: string;
  provider?: ChatProvider;
};

const SYSTEM_PROMPT = `You are a Solution Architect agent in an AI software factory.
Given an objective, produce a solution design as JSON:
{
  "solutionSummary": "brief summary",
  "targetAreas": ["affected modules"],
  "architecturalDecisions": ["key decisions"],
  "workItems": [{"title": "...", "description": "...", "targetAreas": ["..."], "acceptance": ["..."], "validationPlan": ["..."], "dependencies": ["work item titles this depends on"], "parallelizable": true, "executionGroup": "optional-group"}],
  "sequencing": ["task ordering notes"],
  "parallelizationRules": ["parallelization constraints"],
  "validationPlan": ["overall validation steps"],
  "reviewerFocus": ["what reviewers should check"]
}
Return ONLY valid JSON.`;

export async function runArchitect(input: ArchitectInput): Promise<ArchitectOutputState> {
  if (!input.provider) {
    return fallbackArchitect(input);
  }

  try {
    const response = await input.provider.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Lane: ${input.lane}\nObjective: ${input.objective}` },
      ],
      model: "gpt-4o",
      temperature: 0.3,
      responseFormat: { type: "json_object" },
    });

    const raw = JSON.parse(response.content) as Record<string, unknown>;
    if (!raw.solutionSummary || !Array.isArray(raw.targetAreas)) {
      return fallbackArchitect(input);
    }

    // Hydrate work items with required fields the LLM may omit
    const rawItems = (Array.isArray(raw.workItems) ? raw.workItems : []) as Array<Record<string, unknown>>;
    const titledIds = new Map<string, string>();
    const workItems: WorkItemState[] = rawItems.map((wi) => {
      const id = createId("work-item");
      const title = String(wi.title ?? input.objective);
      titledIds.set(title, id);
      return {
        id,
        sessionId: input.sessionId,
        lane: input.lane,
        title,
        description: String(wi.description ?? ""),
        ownerRole: "implementer" as const,
        dependencies: [],
        parallelizable: Boolean(wi.parallelizable),
        executionGroup: typeof wi.executionGroup === "string" ? wi.executionGroup : undefined,
        status: "pending" as const,
        targetAreas: Array.isArray(wi.targetAreas) ? wi.targetAreas as string[] : [],
        acceptance: Array.isArray(wi.acceptance) ? wi.acceptance as string[] : [],
        validationPlan: Array.isArray(wi.validationPlan) ? wi.validationPlan as string[] : [],
        reviewStatus: "pending" as const,
        testStatus: "pending" as const,
      };
    }).map((workItem, index) => {
      const wi = rawItems[index] ?? {};
      const dependencyTitles = Array.isArray(wi.dependencies)
        ? wi.dependencies.filter((value): value is string => typeof value === "string")
        : [];
      return {
        ...workItem,
        dependencies: dependencyTitles.map((title) => titledIds.get(title)).filter((value): value is string => Boolean(value)),
      };
    });

    return {
      solutionSummary: String(raw.solutionSummary),
      targetAreas: raw.targetAreas as string[],
      architecturalDecisions: Array.isArray(raw.architecturalDecisions) ? raw.architecturalDecisions as string[] : [],
      workItems: workItems.length > 0 ? workItems : [makeDefaultWorkItem(input)],
      sequencing: Array.isArray(raw.sequencing) ? raw.sequencing as string[] : [],
      parallelizationRules: Array.isArray(raw.parallelizationRules) ? raw.parallelizationRules as string[] : [],
      validationPlan: Array.isArray(raw.validationPlan) ? raw.validationPlan as string[] : [],
      reviewerFocus: Array.isArray(raw.reviewerFocus) ? raw.reviewerFocus as string[] : [],
      migrationInvariants: input.lane === "migration" && Array.isArray(raw.migrationInvariants)
        ? raw.migrationInvariants as string[]
        : undefined,
    };
  } catch {
    return fallbackArchitect(input);
  }
}

function makeDefaultWorkItem(input: ArchitectInput): WorkItemState {
  return {
    id: createId("work-item"),
    sessionId: input.sessionId,
    lane: input.lane,
    title: input.objective,
    description: input.objective,
    ownerRole: "implementer",
    dependencies: [],
    parallelizable: false,
    executionGroup: undefined,
    status: "pending",
    targetAreas: ["runtime", "workflow"],
    acceptance: ["Implementation follows the active architecture docs."],
    validationPlan: ["Run TypeScript verification after changes."],
    reviewStatus: "pending",
    testStatus: "pending",
  };
}

function fallbackArchitect(input: ArchitectInput): ArchitectOutputState {
  return {
    solutionSummary: `Implement the scoped workflow slice for '${input.objective}'.`,
    targetAreas: ["runtime", "storage", "opencode-app"],
    architecturalDecisions: ["Keep changes minimal and phase-aligned."],
    workItems: [makeDefaultWorkItem(input)],
    sequencing: ["Implement persistence and orchestration before deep retrieval logic."],
    parallelizationRules: ["Do not parallelize tasks that touch the same workflow state files."],
    validationPlan: ["Run npm run check."],
    reviewerFocus: ["Check workflow contract alignment and persistence correctness."],
    migrationInvariants: input.lane === "migration" ? ["Preserve behavior while upgrading internals."] : undefined,
  };
}
