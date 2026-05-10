import fs from "node:fs";
import path from "node:path";
import type {
  FullWorkflowApprovalGate,
  FullWorkflowApprovalGateId,
  FullWorkflowAuditRecord,
  FullWorkflowChildSession,
  FullWorkflowPermission,
  FullWorkflowReport,
  FullWorkflowRoleContract,
  FullWorkflowRoleId,
  FullWorkflowStage,
  FullWorkflowState,
} from "../../../shared/src/types/full-workflow.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { WorkflowState } from "../../../shared/src/types/stage.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { WorkflowStateRepo } from "../../../storage/src/sqlite/repositories/workflow-state-repo.js";
import { runSubagentTask } from "../../../opencode-app/src/agent/subagent-runtime.js";

export const FULL_WORKFLOW_ROLES: FullWorkflowRoleContract[] = [
  { id: "master_orchestrator", displayName: "Master Orchestrator", permission: "read_only", responsibility: "Own parent session, route stages, enforce gates, and surface status." },
  { id: "product_lead", displayName: "Product Lead", permission: "read_only", responsibility: "Convert intent into scope, user stories, acceptance criteria, and edge cases." },
  { id: "solution_lead", displayName: "Solution Lead", permission: "read_only", responsibility: "Convert approved scope into architecture, work items, sequencing, and validation plan." },
  { id: "fullstack_agent", displayName: "Fullstack Agent", permission: "write_with_permission", responsibility: "Implement scoped code changes and record verification evidence." },
  { id: "code_reviewer", displayName: "Code Reviewer", permission: "read_only", responsibility: "Review diffs for bugs, regressions, architecture drift, and missing tests." },
  { id: "qa_agent", displayName: "QA Agent", permission: "bounded_shell", responsibility: "Validate acceptance criteria, run tests, and record QA evidence." },
  { id: "context_scout", displayName: "Context Scout", permission: "read_only", responsibility: "Gather semantic, symbol, LSP, test, docs, and recent-change evidence." },
  { id: "summarizer", displayName: "Summarizer", permission: "read_only", responsibility: "Compress role outputs into parent-session memory without replacing evidence." },
];

export const FULL_WORKFLOW_STAGES: FullWorkflowStage[] = [
  "full_intake",
  "full_product",
  "full_solution",
  "full_implementation",
  "full_code_review",
  "full_qa",
  "full_done",
];

export const FULL_WORKFLOW_APPROVAL_GATES: FullWorkflowApprovalGate[] = [
  { id: "product_to_solution", fromStage: "full_product", toStage: "full_solution" },
  { id: "solution_to_fullstack", fromStage: "full_solution", toStage: "full_implementation" },
  { id: "fullstack_to_code_review", fromStage: "full_implementation", toStage: "full_code_review" },
  { id: "code_review_to_qa", fromStage: "full_code_review", toStage: "full_qa" },
  { id: "qa_to_done", fromStage: "full_qa", toStage: "full_done" },
];

export async function startFullWorkflow(input: {
  repoRoot: string;
  objective: string;
  maxReadOnlyWorkers?: number;
}): Promise<FullWorkflowReport> {
  const objective = input.objective.trim();
  if (!objective) throw new Error("full workflow objective is required.");

  const timestamp = nowIso();
  const parentSessionId = createId("session");
  const state: FullWorkflowState = {
    parentSessionId,
    objective,
    currentStage: "full_product",
    currentOwner: "product_lead",
    status: "running",
    childSessions: [],
    approvals: [],
    artifacts: [],
    rerouteIssues: [],
    evidenceLedgerRefs: [],
    audit: [],
    concurrency: {
      maxReadOnlyWorkers: input.maxReadOnlyWorkers ?? 3,
      singleWriteOwner: "fullstack_agent",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  persistParentSession(input.repoRoot, state);
  recordAudit(input.repoRoot, state, "full.started", "master_orchestrator", "full_intake");
  await runRoleTask(input.repoRoot, state, "product_lead", "full_product");
  writeState(input.repoRoot, state);

  return { parentSessionId, state };
}

export async function inspectFullWorkflow(input: {
  repoRoot: string;
  parentSessionId: string;
}): Promise<FullWorkflowReport> {
  return {
    parentSessionId: input.parentSessionId,
    state: readState(input.repoRoot, input.parentSessionId),
  };
}

export async function advanceFullWorkflow(input: {
  repoRoot: string;
  parentSessionId: string;
  gateId: FullWorkflowApprovalGateId;
  decision: "approve" | "reject";
  reason?: string;
}): Promise<FullWorkflowReport> {
  const state = readState(input.repoRoot, input.parentSessionId);
  const gate = FULL_WORKFLOW_APPROVAL_GATES.find((item) => item.id === input.gateId);
  if (!gate) throw new Error(`Unknown full workflow gate '${input.gateId}'.`);
  if (gate.fromStage !== state.currentStage) {
    throw new Error(`Gate '${input.gateId}' cannot advance current stage '${state.currentStage}'.`);
  }

  const timestamp = nowIso();
  state.approvals.push({
    gateId: input.gateId,
    decision: input.decision,
    reason: input.reason,
    createdAt: timestamp,
  });
  if (input.decision === "reject") {
    state.status = "blocked";
    state.updatedAt = timestamp;
    recordAudit(input.repoRoot, state, "full.gate.rejected", state.currentOwner, state.currentStage);
    writeState(input.repoRoot, state);
    return { parentSessionId: input.parentSessionId, state };
  }

  state.currentStage = gate.toStage;
  state.currentOwner = ownerForStage(gate.toStage);
  state.status = gate.toStage === "full_done" ? "complete" : "running";
  state.updatedAt = timestamp;
  recordAudit(input.repoRoot, state, "full.gate.approved", state.currentOwner, gate.toStage);
  if (gate.toStage !== "full_done") await runRoleTask(input.repoRoot, state, state.currentOwner, gate.toStage);
  persistParentSession(input.repoRoot, state);
  writeState(input.repoRoot, state);

  return { parentSessionId: input.parentSessionId, state };
}

export async function rerouteFullWorkflow(input: {
  repoRoot: string;
  parentSessionId: string;
  finding: string;
  targetStage: FullWorkflowStage;
}): Promise<FullWorkflowReport> {
  const state = readState(input.repoRoot, input.parentSessionId);
  if (!FULL_WORKFLOW_STAGES.includes(input.targetStage)) {
    throw new Error(`Unknown full workflow stage '${input.targetStage}'.`);
  }
  const timestamp = nowIso();
  state.rerouteIssues.push({
    id: createId("reroute"),
    finding: input.finding,
    targetStage: input.targetStage,
    createdAt: timestamp,
  });
  state.currentStage = input.targetStage;
  state.currentOwner = ownerForStage(input.targetStage);
  state.status = input.targetStage === "full_done" ? "complete" : "running";
  state.updatedAt = timestamp;
  recordAudit(input.repoRoot, state, "full.rerouted", state.currentOwner, input.targetStage);
  persistParentSession(input.repoRoot, state);
  writeState(input.repoRoot, state);

  return { parentSessionId: input.parentSessionId, state };
}

export async function blockFullWorkflow(input: {
  repoRoot: string;
  parentSessionId: string;
  reason: string;
}): Promise<FullWorkflowReport> {
  const state = readState(input.repoRoot, input.parentSessionId);
  const timestamp = nowIso();
  state.status = "blocked";
  state.rerouteIssues.push({
    id: createId("reroute"),
    finding: input.reason,
    targetStage: state.currentStage,
    createdAt: timestamp,
  });
  state.updatedAt = timestamp;
  recordAudit(input.repoRoot, state, "full.gate.rejected", state.currentOwner, state.currentStage);
  persistParentSession(input.repoRoot, state);
  writeState(input.repoRoot, state);
  return { parentSessionId: input.parentSessionId, state };
}

export async function runFullWorkflowSupportRole(input: {
  repoRoot: string;
  parentSessionId: string;
  role: Extract<FullWorkflowRoleId, "context_scout" | "summarizer">;
  stage?: FullWorkflowStage;
}): Promise<FullWorkflowReport> {
  const state = readState(input.repoRoot, input.parentSessionId);
  await runRoleTask(input.repoRoot, state, input.role, input.stage ?? state.currentStage);
  writeState(input.repoRoot, state);
  return { parentSessionId: input.parentSessionId, state };
}

export async function closeFullWorkflow(input: {
  repoRoot: string;
  parentSessionId: string;
}): Promise<FullWorkflowReport> {
  const state = readState(input.repoRoot, input.parentSessionId);
  state.currentStage = "full_done";
  state.currentOwner = "master_orchestrator";
  state.status = "complete";
  state.updatedAt = nowIso();
  recordAudit(input.repoRoot, state, "full.closed", "master_orchestrator", "full_done");
  persistParentSession(input.repoRoot, state);
  writeState(input.repoRoot, state);
  return { parentSessionId: input.parentSessionId, state };
}

async function runRoleTask(
  repoRoot: string,
  state: FullWorkflowState,
  role: FullWorkflowRoleId,
  stage: FullWorkflowStage,
): Promise<void> {
  const contract = roleContract(role);
  const child: FullWorkflowChildSession = {
    id: createId("child-session"),
    role,
    stage,
    status: "running",
    permission: contract.permission,
  };
  state.childSessions.push(child);
  recordAudit(repoRoot, state, "full.role.started", role, stage);
  const summary = await runSubagentTask({
    agentId: role,
    prompt: `${stage}: ${state.objective}`,
    maxResultBytes: 2000,
  });
  child.status = "complete";
  child.summary = summary;
  state.artifacts.push({
    id: createId("artifact"),
    type: "role_output",
    role,
    stage,
    summary,
    evidenceRefs: [...state.evidenceLedgerRefs],
    createdAt: nowIso(),
  });
  recordAudit(repoRoot, state, "full.role.finished", role, stage);
  state.updatedAt = nowIso();
}

function persistParentSession(repoRoot: string, state: FullWorkflowState): void {
  const session: SessionState = {
    sessionId: state.parentSessionId,
    repoRoot,
    lane: "full",
    laneLocked: true,
    currentStage: state.currentStage,
    status: state.status === "complete" ? "complete" : state.status === "blocked" ? "blocked" : "in_progress",
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    activeWorkItemIds: state.childSessions.filter((child) => child.status === "running").map((child) => child.id),
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
  new SessionsRepo(repoRoot).save(session);
  const workflow: WorkflowState = {
    lane: "full",
    stage: state.currentStage,
    stageStatus: state.status === "complete" ? "passed" : state.status === "blocked" ? "blocked" : "in_progress",
    previousStage: undefined,
    nextStage: nextStage(state.currentStage),
    gateStatus: "pending",
    blockers: state.rerouteIssues.map((issue) => issue.finding),
  };
  new WorkflowStateRepo(repoRoot).save(state.parentSessionId, workflow);
}

function recordAudit(
  repoRoot: string,
  state: FullWorkflowState,
  eventType: FullWorkflowAuditRecord["eventType"],
  role: FullWorkflowRoleId,
  stage: FullWorkflowStage,
): void {
  const record: FullWorkflowAuditRecord = {
    id: createId("audit"),
    eventType,
    role,
    stage,
    createdAt: nowIso(),
  };
  state.audit.push(record);
  new SessionRuntimeEventsRepo(repoRoot).save({
    sessionId: state.parentSessionId,
    eventType,
    eventJson: record,
    createdAt: record.createdAt,
  });
}

function statePath(repoRoot: string, parentSessionId: string): string {
  return path.join(repoRoot, ".dh", "full-workflow", `${parentSessionId}.json`);
}

function writeState(repoRoot: string, state: FullWorkflowState): void {
  const file = statePath(repoRoot, state.parentSessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function readState(repoRoot: string, parentSessionId: string): FullWorkflowState {
  const file = statePath(repoRoot, parentSessionId);
  if (!fs.existsSync(file)) throw new Error(`Full workflow parent session '${parentSessionId}' was not found.`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as FullWorkflowState;
}

function ownerForStage(stage: FullWorkflowStage): FullWorkflowRoleId {
  switch (stage) {
    case "full_product":
      return "product_lead";
    case "full_solution":
      return "solution_lead";
    case "full_implementation":
      return "fullstack_agent";
    case "full_code_review":
      return "code_reviewer";
    case "full_qa":
      return "qa_agent";
    case "full_intake":
    case "full_done":
      return "master_orchestrator";
  }
}

function nextStage(stage: FullWorkflowStage): FullWorkflowStage | undefined {
  const index = FULL_WORKFLOW_STAGES.indexOf(stage);
  return index === -1 ? undefined : FULL_WORKFLOW_STAGES[index + 1];
}

function roleContract(role: FullWorkflowRoleId): FullWorkflowRoleContract {
  const contract = FULL_WORKFLOW_ROLES.find((entry) => entry.id === role);
  if (!contract) throw new Error(`Unknown full workflow role '${role}'.`);
  return contract;
}
