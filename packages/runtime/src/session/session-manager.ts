import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { resolveAgentModel } from "../../../providers/src/resolution/resolve-agent-model.js";
import { AgentModelAssignmentsRepo } from "../../../storage/src/sqlite/repositories/agent-model-assignments-repo.js";
import { SessionStore } from "../../../storage/src/fs/session-store.js";
import { ExecutionEnvelopesRepo } from "../../../storage/src/sqlite/repositories/execution-envelopes-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { WorkflowStateRepo } from "../../../storage/src/sqlite/repositories/workflow-state-repo.js";
import { createWorkflowState } from "../workflow/workflow-state-manager.js";
import { writeWorkflowCompatibilityMirror } from "../workflow/workflow-state-mirror.js";
import { createLaneLockedSession } from "./lane-lock-manager.js";
import { recordSessionBootstrap } from "./session-bootstrap-log.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import { buildExecutionEnvelope } from "../../../opencode-app/src/planner/build-execution-envelope.js";

export type SessionBootstrapResult = {
  session: SessionState;
  envelope: ExecutionEnvelopeState;
};

export class SessionManager {
  private readonly assignmentsRepo: AgentModelAssignmentsRepo;
  private readonly sessionStore: SessionStore;
  private readonly sessionsRepo: SessionsRepo;
  private readonly workflowStateRepo: WorkflowStateRepo;
  private readonly executionEnvelopesRepo: ExecutionEnvelopesRepo;

  constructor(private readonly repoRoot: string) {
    this.assignmentsRepo = new AgentModelAssignmentsRepo(repoRoot);
    this.sessionStore = new SessionStore(repoRoot);
    this.sessionsRepo = new SessionsRepo(repoRoot);
    this.workflowStateRepo = new WorkflowStateRepo(repoRoot);
    this.executionEnvelopesRepo = new ExecutionEnvelopesRepo(repoRoot);
  }

  async createSession(lane: WorkflowLane, agent: AgentRegistryEntry): Promise<SessionBootstrapResult> {
    const session = createLaneLockedSession(this.repoRoot, lane);
    const assignment = await this.assignmentsRepo.findByAgentId(agent.agentId);
    const envelope: ExecutionEnvelopeState = {
      ...buildExecutionEnvelope(session, agent),
      resolvedModel: resolveAgentModel(agent.agentId, assignment),
      id: createId("env"),
      createdAt: nowIso(),
    };
    const workflow = createWorkflowState(session);
    this.sessionsRepo.save(session);
    this.workflowStateRepo.save(session.sessionId, workflow);
    this.executionEnvelopesRepo.save(envelope);
    recordSessionBootstrap({ repoRoot: this.repoRoot, session, envelope });
    await this.sessionStore.write({
      session,
      workflow,
      envelopes: [envelope],
    });
    await writeWorkflowCompatibilityMirror({
      repoRoot: this.repoRoot,
      session,
      workflow,
      latestEnvelope: envelope,
    });
    return { session, envelope };
  }

  async readSession(sessionId: string) {
    return this.sessionStore.read(sessionId);
  }
}
