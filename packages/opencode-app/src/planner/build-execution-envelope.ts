import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { chooseAgentModel } from "./choose-agent-model.js";
import { chooseMcps } from "./choose-mcps.js";
import { chooseSkills } from "./choose-skills.js";

export function buildExecutionEnvelope(session: SessionState, agent: AgentRegistryEntry): ExecutionEnvelopeState {
  const base: ExecutionEnvelopeState = {
    id: createId("env"),
    sessionId: session.sessionId,
    lane: session.lane,
    role: agent.role,
    agentId: agent.agentId,
    stage: session.currentStage,
    resolvedModel: chooseAgentModel(agent.agentId),
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    semanticMode: session.semanticMode,
    evidencePolicy: "strict",
    createdAt: nowIso(),
  };

  return {
    ...base,
    activeSkills: chooseSkills(base),
    activeMcps: chooseMcps(base, "codebase"),
  };
}
