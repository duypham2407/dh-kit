import type { AgentRegistryEntry } from "../types/agent.js";

export const DEFAULT_AGENT_REGISTRY: AgentRegistryEntry[] = [
  { agentId: "quick-agent", displayName: "Quick Agent", role: "quick", lanes: ["quick"], configurable: true, defaultProvider: "openai", defaultModel: "gpt-5", defaultVariant: "default" },
  { agentId: "coordinator", displayName: "Coordinator", role: "coordinator", lanes: ["delivery", "migration"], configurable: true, defaultProvider: "openai", defaultModel: "gpt-5", defaultVariant: "default" },
  { agentId: "analyst", displayName: "Analyst", role: "analyst", lanes: ["delivery", "migration"], configurable: true, defaultProvider: "anthropic", defaultModel: "claude-opus", defaultVariant: "high-reasoning" },
  { agentId: "architect", displayName: "Architect", role: "architect", lanes: ["delivery", "migration"], configurable: true, defaultProvider: "anthropic", defaultModel: "claude-opus", defaultVariant: "high-reasoning" },
  { agentId: "implementer", displayName: "Implementer", role: "implementer", lanes: ["delivery", "migration"], configurable: true, defaultProvider: "openai", defaultModel: "gpt-codex", defaultVariant: "default" },
  { agentId: "reviewer", displayName: "Reviewer", role: "reviewer", lanes: ["delivery", "migration"], configurable: true, defaultProvider: "openai", defaultModel: "gpt-5", defaultVariant: "tool-use-optimized" },
  { agentId: "tester", displayName: "Tester", role: "tester", lanes: ["delivery", "migration"], configurable: true, defaultProvider: "openai", defaultModel: "gpt-5", defaultVariant: "default" }
];
