import type { WorkflowState } from "../../../shared/src/types/stage.js";

export type GateEvaluationInput = {
  workflow: WorkflowState;
  objective: string;
  evidence?: {
    requirementsClear?: boolean;
    acceptanceCriteriaDefined?: boolean;
    solutionDefined?: boolean;
    sequencingDefined?: boolean;
    blockerFindingsResolved?: boolean;
    verificationEvidencePresent?: boolean;
  };
};

export type GateEvaluationResult = {
  pass: boolean;
  gate: "intake" | "analysis" | "solution" | "review" | "verification" | "none";
  reason: string;
};

export function evaluateGate(input: GateEvaluationInput): GateEvaluationResult {
  const stage = input.workflow.stage;
  const evidence = input.evidence ?? {};

  if (stage.endsWith("intake")) {
    return {
      pass: input.objective.trim().length > 0,
      gate: "intake",
      reason: input.objective.trim().length > 0 ? "Objective is present." : "Objective is required for intake gate.",
    };
  }

  if (stage.endsWith("analysis") || stage.endsWith("baseline") || stage === "quick_plan") {
    const pass = Boolean(evidence.requirementsClear && evidence.acceptanceCriteriaDefined);
    return {
      pass,
      gate: "analysis",
      reason: pass ? "Requirements and acceptance criteria are defined." : "Requirements clarity and acceptance criteria are required.",
    };
  }

  if (stage.endsWith("solution") || stage.endsWith("strategy") || stage.endsWith("task_split")) {
    const pass = Boolean(evidence.solutionDefined && evidence.sequencingDefined);
    return {
      pass,
      gate: "solution",
      reason: pass ? "Solution and sequencing are defined." : "Solution and sequencing must be defined before execution.",
    };
  }

  if (stage.endsWith("review")) {
    const pass = Boolean(evidence.blockerFindingsResolved);
    return {
      pass,
      gate: "review",
      reason: pass ? "Review blockers are resolved." : "Review blockers must be resolved.",
    };
  }

  if (stage.endsWith("verify") || stage.endsWith("complete")) {
    const pass = Boolean(evidence.verificationEvidencePresent);
    return {
      pass,
      gate: "verification",
      reason: pass ? "Verification evidence is present." : "Verification evidence is required.",
    };
  }

  return {
    pass: true,
    gate: "none",
    reason: "No gate applies to this stage.",
  };
}
