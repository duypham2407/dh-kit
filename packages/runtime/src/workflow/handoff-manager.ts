import type { AgentRole } from "../../../shared/src/types/agent.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";

export type HandoffPayload = {
  lane: WorkflowLane;
  fromRole: AgentRole | "quick";
  toRole: AgentRole | "quick" | "complete";
  stage: string;
  notes: string[];
  requiredArtifacts: string[];
};

export function buildHandoff(input: {
  lane: WorkflowLane;
  fromRole: AgentRole | "quick";
  toRole: AgentRole | "quick" | "complete";
  stage: string;
}): HandoffPayload {
  return {
    lane: input.lane,
    fromRole: input.fromRole,
    toRole: input.toRole,
    stage: input.stage,
    notes: buildNotes(input.lane, input.fromRole, input.toRole),
    requiredArtifacts: buildArtifacts(input.lane, input.fromRole, input.toRole),
  };
}

function buildNotes(lane: WorkflowLane, fromRole: AgentRole | "quick", toRole: AgentRole | "quick" | "complete"): string[] {
  if (fromRole === "coordinator" && toRole === "analyst") {
    return ["Lane is locked.", "Objective and repo target are established."];
  }
  if (fromRole === "analyst" && toRole === "architect") {
    return ["Problem statement is clarified.", "Acceptance criteria are defined."];
  }
  if (fromRole === "architect" && toRole === "implementer") {
    return ["Solution direction is approved.", "Task decomposition is ready."];
  }
  if (fromRole === "implementer" && toRole === "reviewer") {
    return ["Changed areas are listed.", "Local verification notes are attached."];
  }
  if (fromRole === "reviewer" && toRole === "tester") {
    return lane === "migration"
      ? ["Review findings are resolved or accepted.", "Residual risks and preserve-behavior invariants are stated."]
      : ["Review findings are resolved or accepted.", "Residual risks are stated."];
  }
  return ["Handoff is ready."];
}

function buildArtifacts(lane: WorkflowLane, fromRole: AgentRole | "quick", toRole: AgentRole | "quick" | "complete"): string[] {
  if (fromRole === "coordinator" && toRole === "analyst") {
    return ["session_state", "lane_state", "objective"];
  }
  if (fromRole === "analyst" && toRole === "architect") {
    return ["problem_statement", "scope", "acceptance_criteria"];
  }
  if (fromRole === "architect" && toRole === "implementer") {
    return lane === "migration"
      ? ["solution_summary", "work_items", "validation_plan", "migration_invariants"]
      : ["solution_summary", "work_items", "validation_plan"];
  }
  if (fromRole === "implementer" && toRole === "reviewer") {
    return ["changed_areas", "summary", "local_verification"];
  }
  if (fromRole === "reviewer" && toRole === "tester") {
    return lane === "migration"
      ? ["findings", "quality_gate", "residual_risks", "preserve_behavior_evidence"]
      : ["findings", "quality_gate", "residual_risks"];
  }
  return ["handoff_notes"];
}
