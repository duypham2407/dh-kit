import type { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { buildBridgeEnvelopeContext } from "../protocol/envelope-contract.js";
import type { BridgeResult } from "../protocol/error-envelope.js";
import type { ResolvedModelBridge } from "../types/model.js";
import { writeHookDecision } from "./decision-writer.js";

export function writeModelOverrideDecision(
  repo: HookInvocationLogsRepo,
  input: {
    sessionId: string;
    envelopeId?: string;
    model: ResolvedModelBridge;
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
    hookName: "model_override",
    decision: "modify",
    reason: input.reason ?? "model override resolved",
    payloadIn: {
      sessionId: input.sessionId,
    },
    payloadOut: {
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      variantId: input.model.variantId,
    },
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, value: { id: result.value.id } };
}
