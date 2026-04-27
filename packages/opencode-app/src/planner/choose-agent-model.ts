import type { AgentModelAssignment, ResolvedModelSelection } from "../../../shared/src/types/model.js";
import { resolveAgentModel } from "../../../providers/src/resolution/resolve-agent-model.js";

export async function chooseAgentModel(repoRoot: string, agentId: string, assignment?: AgentModelAssignment): Promise<ResolvedModelSelection> {
  return await resolveAgentModel(repoRoot, agentId, assignment);
}
