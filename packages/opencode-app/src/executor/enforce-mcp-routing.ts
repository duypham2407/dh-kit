import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { chooseMcps } from "../planner/choose-mcps.js";

export function enforceMcpRouting(envelope: ExecutionEnvelopeState, intent: string): string[] {
  return chooseMcps(envelope, intent);
}
