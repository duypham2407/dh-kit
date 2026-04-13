import type { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { buildBridgeEnvelopeContext } from "../protocol/envelope-contract.js";
import type { BridgeResult } from "../protocol/error-envelope.js";
import { writeHookDecision } from "./decision-writer.js";
import type { DhSessionStateBridge } from "../types/session.js";

export function writeSessionStateDecision(
  repo: HookInvocationLogsRepo,
  input: {
    sessionId: string;
    envelopeId?: string;
    state: DhSessionStateBridge;
    reason?: string;
  },
): BridgeResult<{ id: string }> {
  const envelope = buildBridgeEnvelopeContext({
    sessionId: input.sessionId,
    envelopeId: input.envelopeId,
    transportMode: "sqlite",
  });

  const result = writeHookDecision(repo, {
    envelope,
    hookName: "session_state",
    decision: "modify",
    reason: input.reason ?? "session state synchronized",
    payloadIn: { sessionId: input.sessionId },
    payloadOut: {
      lane: input.state.lane,
      laneLocked: input.state.laneLocked,
      currentStage: input.state.currentStage,
      semanticMode: input.state.semanticMode,
      toolEnforcementLevel: input.state.toolEnforcementLevel,
      activeWorkItemIds: input.state.activeWorkItemIds,
    },
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, value: { id: result.value.id } };
}
