import type { AgentRegistryEntry } from "../../../../../packages/shared/src/types/agent.js";
import { promptForSelection } from "../prompt.js";

export function selectAgent(agents: AgentRegistryEntry[]): AgentRegistryEntry {
  const configurableAgent = agents.find((agent) => agent.configurable);
  if (!configurableAgent) {
    throw new Error("No configurable agent is available.");
  }
  return configurableAgent;
}

export async function promptAgentSelection(agents: AgentRegistryEntry[]): Promise<AgentRegistryEntry> {
  const configurableAgents = agents.filter((agent) => agent.configurable);
  if (configurableAgents.length === 0) {
    throw new Error("No configurable agent is available.");
  }
  return promptForSelection({
    label: "Select agent:",
    options: configurableAgents,
    nonInteractiveFallback: configurableAgents[0],
  });
}
