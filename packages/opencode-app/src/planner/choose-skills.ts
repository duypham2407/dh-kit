import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { DEFAULT_SKILL_REGISTRY } from "../registry/skill-registry.js";

export function chooseSkills(envelope: ExecutionEnvelopeState, intent = "codebase"): string[] {
  const tags = buildSkillTags(envelope, intent);
  const matches = DEFAULT_SKILL_REGISTRY.filter((entry) => {
    return entry.lanes.includes(envelope.lane)
      && entry.roles.includes(envelope.role)
      && entry.triggerTags.some((tag) => tags.includes(tag));
  }).map((entry) => entry.skillName);

  return Array.from(new Set(matches));
}

function buildSkillTags(envelope: ExecutionEnvelopeState, intent: string): string[] {
  const tags = ["always"];
  if (intent.includes("trace")) {
    tags.push("trace_flow");
  }
  if (intent.includes("explain") || intent.includes("codebase")) {
    tags.push("explain_module", "broad_codebase_question");
  }
  if (intent.includes("bug") || intent.includes("debug")) {
    tags.push("bug_investigation", "debug");
  }
  if (intent.includes("browser") || intent.includes("frontend")) {
    tags.push("browser", "frontend");
  }
  if (intent.includes("react")) {
    tags.push("react");
  }
  if (intent.includes("react-native") || intent.includes("expo")) {
    tags.push("react-native", "expo");
  }
  if (envelope.lane !== "quick") {
    tags.push("verify");
  }
  if (envelope.role === "architect") {
    tags.push("solution");
  }
  if (envelope.role === "implementer") {
    tags.push("execute");
  }
  if (envelope.role === "reviewer") {
    tags.push("review");
  }
  if (envelope.role === "analyst") {
    tags.push("analysis");
  }
  if (envelope.lane === "migration") {
    tags.push("migration", "research");
  }
  return tags;
}
