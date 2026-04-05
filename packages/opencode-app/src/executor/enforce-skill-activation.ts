import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { chooseSkills } from "../planner/choose-skills.js";

export function enforceSkillActivation(envelope: ExecutionEnvelopeState): string[] {
  return chooseSkills(envelope);
}
