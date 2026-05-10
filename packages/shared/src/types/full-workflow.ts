export type FullWorkflowRoleId =
  | "master_orchestrator"
  | "product_lead"
  | "solution_lead"
  | "fullstack_agent"
  | "code_reviewer"
  | "qa_agent"
  | "context_scout"
  | "summarizer";

export type FullWorkflowPermission = "read_only" | "write_with_permission" | "bounded_shell";

export type FullWorkflowRoleContract = {
  id: FullWorkflowRoleId;
  displayName: string;
  permission: FullWorkflowPermission;
  responsibility: string;
};

export type FullWorkflowStage =
  | "full_intake"
  | "full_product"
  | "full_solution"
  | "full_implementation"
  | "full_code_review"
  | "full_qa"
  | "full_done";

export type FullWorkflowApprovalGateId =
  | "product_to_solution"
  | "solution_to_fullstack"
  | "fullstack_to_code_review"
  | "code_review_to_qa"
  | "qa_to_done";

export type FullWorkflowApprovalGate = {
  id: FullWorkflowApprovalGateId;
  fromStage: FullWorkflowStage;
  toStage: FullWorkflowStage;
};

export type FullWorkflowChildSession = {
  id: string;
  role: FullWorkflowRoleId;
  stage: FullWorkflowStage;
  status: "pending" | "running" | "complete" | "blocked";
  permission: FullWorkflowPermission;
  summary?: string;
};

export type FullWorkflowArtifact = {
  id: string;
  type: "role_output" | "handoff" | "qa_evidence" | "review_findings";
  role: FullWorkflowRoleId;
  stage: FullWorkflowStage;
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
};

export type FullWorkflowApproval = {
  gateId: FullWorkflowApprovalGateId;
  decision: "approve" | "reject";
  reason?: string;
  createdAt: string;
};

export type FullWorkflowRerouteIssue = {
  id: string;
  finding: string;
  targetStage: FullWorkflowStage;
  createdAt: string;
};

export type FullWorkflowAuditRecord = {
  id: string;
  eventType:
    | "full.started"
    | "full.role.started"
    | "full.role.finished"
    | "full.gate.approved"
    | "full.gate.rejected"
    | "full.rerouted"
    | "full.closed";
  role?: FullWorkflowRoleId;
  stage: FullWorkflowStage;
  createdAt: string;
};

export type FullWorkflowState = {
  parentSessionId: string;
  objective: string;
  currentStage: FullWorkflowStage;
  currentOwner: FullWorkflowRoleId;
  status: "running" | "blocked" | "complete";
  childSessions: FullWorkflowChildSession[];
  approvals: FullWorkflowApproval[];
  artifacts: FullWorkflowArtifact[];
  rerouteIssues: FullWorkflowRerouteIssue[];
  evidenceLedgerRefs: string[];
  audit: FullWorkflowAuditRecord[];
  concurrency: {
    maxReadOnlyWorkers: number;
    singleWriteOwner: "fullstack_agent";
  };
  createdAt: string;
  updatedAt: string;
};

export type FullWorkflowReport = {
  parentSessionId: string;
  state: FullWorkflowState;
};
