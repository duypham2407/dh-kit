import type { AgentRole } from "./agent.js";
import type { WorkItemState } from "./work-item.js";

export type CoordinatorOutputState = {
  lane: "quick" | "delivery" | "migration";
  stage: string;
  nextRole: AgentRole | "complete";
  summary: string;
  handoffNotes: string[];
  workItems?: WorkItemState[];
  blockers?: string[];
};

export type AnalystOutputState = {
  problemStatement: string;
  scope: string[];
  outOfScope: string[];
  assumptions: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  risks: string[];
  recommendedNextRole: "architect" | "coordinator";
};

export type ArchitectOutputState = {
  solutionSummary: string;
  targetAreas: string[];
  architecturalDecisions: string[];
  workItems: WorkItemState[];
  sequencing: string[];
  parallelizationRules: string[];
  validationPlan: string[];
  reviewerFocus: string[];
  migrationInvariants?: string[];
};

export type ImplementerOutputState = {
  status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";
  workItemId: string;
  changedAreas: string[];
  summary: string;
  concerns: string[];
  localVerification: string[];
  reviewNotes: string[];
};

export type ReviewFinding = {
  severity: "high" | "medium" | "low";
  location: string;
  summary: string;
  rationale: string;
};

export type ReviewerOutputState = {
  status: "PASS" | "PASS_WITH_NOTES" | "FAIL";
  findings: ReviewFinding[];
  scopeCompliance: "pass" | "fail";
  qualityGate: "pass" | "fail";
  nextAction: "tester" | "implementer" | "coordinator";
};

export type TesterOutputState = {
  status: "PASS" | "FAIL" | "PARTIAL";
  executedChecks: string[];
  evidence: string[];
  unmetCriteria: string[];
  limitations: string[];
  nextAction: "complete" | "implementer" | "coordinator";
};

export type QuickOutputState = {
  status: "DONE" | "DONE_WITH_CONCERNS" | "BLOCKED";
  summary: string;
  actionsTaken: string[];
  verification: string[];
  nextRole: "complete" | "coordinator";
};

export type RoleOutputPayload =
  | CoordinatorOutputState
  | AnalystOutputState
  | ArchitectOutputState
  | ImplementerOutputState
  | ReviewerOutputState
  | TesterOutputState
  | QuickOutputState;

export type RoleOutputRecord = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  stage: string;
  payload: RoleOutputPayload;
  createdAt: string;
};
