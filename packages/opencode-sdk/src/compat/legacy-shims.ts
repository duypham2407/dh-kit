// Legacy bridge type shims for staged migration.
// Remove when all callers import from @dh/opencode-sdk directly.

export type {
  HookDecision,
  HookDecisionRecord as HookInvocationLog,
  HookName,
} from "../types/hook-decision.js";

export type { ExecutionEnvelopeBridge as ExecutionEnvelopeState } from "../types/envelope.js";
export type { DhSessionStateBridge as SessionState } from "../types/session.js";
export type { ResolvedModelBridge as ResolvedModelSelection } from "../types/model.js";
