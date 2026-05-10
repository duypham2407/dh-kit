import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import type {
  AgentCreateInput,
  AgentCreateReport,
  AgentListReport,
  AgentPermissionPolicy,
  AgentPublicEntry,
  AgentRegistryEntry,
} from "../../../shared/src/types/agent.js";

type AgentStore = {
  agents: AgentRegistryEntry[];
};

const VALID_PERMISSIONS: AgentPermissionPolicy[] = ["read_only", "standard", "builder", "restricted"];

export class AgentConfigService {
  constructor(private readonly repoRoot: string) {}

  listAgents(): AgentListReport {
    return {
      agents: [
        ...DEFAULT_AGENT_REGISTRY.map((agent) => toPublicAgent(agent, "builtin")),
        ...this.readStore().agents.map((agent) => toPublicAgent(agent, "local")),
      ],
    };
  }

  createAgent(input: AgentCreateInput): AgentCreateReport {
    validateAgentId(input.id);
    if (input.prompt.trim().length === 0) {
      throw new Error("--prompt is required.");
    }
    const permission = input.permission ?? "standard";
    if (!VALID_PERMISSIONS.includes(permission)) {
      throw new Error(`Invalid permission '${permission}'.`);
    }
    const existing = this.listAgents().agents.find((agent) => agent.agentId === input.id);
    if (existing) {
      throw new Error(`Agent '${input.id}' already exists.`);
    }

    const model = input.model ? parseModel(input.model) : undefined;
    const agent: AgentRegistryEntry = {
      agentId: input.id,
      displayName: humanizeAgentId(input.id),
      role: "quick",
      lanes: ["quick", "delivery", "migration"],
      configurable: true,
      mode: input.mode,
      prompt: input.prompt,
      permission,
      defaultProvider: model?.provider ?? "openai",
      defaultModel: model?.model ?? "gpt-5",
      defaultVariant: "default",
    };
    const store = this.readStore();
    store.agents.push(agent);
    this.writeStore(store);
    return { agent: toPublicAgent(agent, "local") };
  }

  private storePath(): string {
    return path.join(this.repoRoot, ".dh", "agents", "agents.json");
  }

  private readStore(): AgentStore {
    const file = this.storePath();
    if (!fs.existsSync(file)) return { agents: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`Could not parse agent config at ${file}: ${(error as Error).message}`);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as AgentStore).agents)) {
      throw new Error(`Agent config at ${file} must contain an agents array.`);
    }
    return { agents: (parsed as AgentStore).agents };
  }

  private writeStore(store: AgentStore): void {
    const file = this.storePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  }
}

function toPublicAgent(agent: AgentRegistryEntry, source: AgentPublicEntry["source"]): AgentPublicEntry {
  return {
    ...agent,
    mode: agent.mode ?? "primary",
    prompt: agent.prompt ?? "",
    permission: agent.permission ?? "standard",
    source,
  };
}

function validateAgentId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("--id may only contain letters, numbers, dashes, and underscores.");
  }
}

function parseModel(model: string): { provider: string; model: string } {
  const [provider, modelId, ...rest] = model.split("/");
  if (!provider || !modelId || rest.length > 0) {
    throw new Error("--model must use provider/model format.");
  }
  return { provider, model: modelId };
}

function humanizeAgentId(id: string): string {
  return id.split(/[-_]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}
