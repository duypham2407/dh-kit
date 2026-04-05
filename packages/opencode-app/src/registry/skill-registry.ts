import type { AgentRole } from "../../../shared/src/types/agent.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";

export type SkillRegistryEntry = {
  skillName: string;
  description: string;
  lanes: WorkflowLane[];
  roles: Array<AgentRole | "quick">;
  triggerTags: string[];
};

export const DEFAULT_SKILL_REGISTRY: SkillRegistryEntry[] = [
  { skillName: "using-skills", description: "Always-on SOP reminder", lanes: ["quick", "delivery", "migration"], roles: ["quick", "coordinator", "analyst", "architect", "implementer", "reviewer", "tester"], triggerTags: ["always"] },
  { skillName: "codebase-exploration", description: "Broad code understanding", lanes: ["quick", "delivery", "migration"], roles: ["quick", "analyst", "architect"], triggerTags: ["explain_module", "trace_flow", "broad_codebase_question"] },
  { skillName: "systematic-debugging", description: "Bug investigation workflow", lanes: ["quick", "delivery", "migration"], roles: ["quick", "analyst", "implementer"], triggerTags: ["bug_investigation"] },
  { skillName: "verification-before-completion", description: "Pre-completion verification", lanes: ["quick", "delivery", "migration"], roles: ["quick", "coordinator", "reviewer", "tester"], triggerTags: ["always", "verify"] },
  { skillName: "writing-solution", description: "Architectural solution writing", lanes: ["delivery", "migration"], roles: ["architect"], triggerTags: ["solution"] },
  { skillName: "subagent-driven-development", description: "Task-split execution discipline", lanes: ["delivery", "migration"], roles: ["implementer"], triggerTags: ["execute"] },
  { skillName: "code-review", description: "Review discipline", lanes: ["delivery", "migration"], roles: ["reviewer"], triggerTags: ["review"] },
  { skillName: "test-driven-development", description: "TDD execution", lanes: ["delivery"], roles: ["implementer"], triggerTags: ["execute", "tests"] },
  { skillName: "brainstorming", description: "Ambiguity reduction", lanes: ["delivery", "migration"], roles: ["analyst"], triggerTags: ["analysis"] },
  { skillName: "refactoring", description: "Safe restructure workflow", lanes: ["quick", "delivery", "migration"], roles: ["quick", "implementer"], triggerTags: ["refactor"] },
  { skillName: "deep-research", description: "External research heavy tasks", lanes: ["delivery", "migration"], roles: ["architect", "analyst"], triggerTags: ["research", "migration"] },
  { skillName: "browser-automation", description: "Browser verification flows", lanes: ["quick", "delivery", "migration"], roles: ["quick", "tester"], triggerTags: ["browser"] },
  { skillName: "dev-browser", description: "Browser diagnostics", lanes: ["quick", "delivery", "migration"], roles: ["quick", "tester"], triggerTags: ["browser", "debug"] },
  { skillName: "frontend-ui-ux", description: "Frontend quality guidance", lanes: ["quick", "delivery", "migration"], roles: ["quick", "architect", "implementer"], triggerTags: ["frontend", "react"] },
  { skillName: "vercel-composition-patterns", description: "React composition guidance", lanes: ["quick", "delivery", "migration"], roles: ["quick", "architect", "implementer"], triggerTags: ["react", "composition"] },
  { skillName: "vercel-react-best-practices", description: "React runtime quality guidance", lanes: ["quick", "delivery", "migration"], roles: ["quick", "architect", "implementer"], triggerTags: ["react", "frontend"] },
  { skillName: "vercel-react-native-skills", description: "React Native guidance", lanes: ["quick", "delivery", "migration"], roles: ["quick", "architect", "implementer"], triggerTags: ["react-native", "expo"] },
  { skillName: "find-skills", description: "Capability discovery", lanes: ["quick", "delivery", "migration"], roles: ["quick", "analyst"], triggerTags: ["find-skills"] },
];
