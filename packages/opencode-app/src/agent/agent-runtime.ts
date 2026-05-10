import type { AgentRegistryEntry } from "../../../shared/src/types/agent.js";
import { AgentConfigService } from "./agent-config-service.js";

export class AgentRuntime {
  constructor(private readonly repoRoot: string) {}

  resolveAgent(agentId?: string): AgentRegistryEntry {
    const requested = agentId ?? "quick-agent";
    const agent = new AgentConfigService(this.repoRoot).listAgents().agents.find((entry) => entry.agentId === requested);
    if (!agent) {
      throw new Error(`Agent '${requested}' is not registered.`);
    }
    const { source: _source, ...registryEntry } = agent;
    return registryEntry;
  }
}
