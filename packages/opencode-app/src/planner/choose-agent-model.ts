import type { AgentModelAssignment, ResolvedModelSelection } from "../../../shared/src/types/model.js";
import { resolveAgentModel } from "../../../providers/src/resolution/resolve-agent-model.js";

export function chooseAgentModel(agentId: string, assignment?: AgentModelAssignment): ResolvedModelSelection {
  return resolveAgentModel(agentId, assignment);
}
