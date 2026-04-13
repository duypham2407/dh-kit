import type { BridgeEnvelopeContext, ExecutionEnvelopeIdentity } from "../types/envelope.js";
import type { TransportMode } from "../types/transport-mode.js";

export function toEnvelopeIdentity(input: {
  sessionId: string;
  envelopeId?: string;
}): ExecutionEnvelopeIdentity {
  const envelopeId = input.envelopeId && input.envelopeId.trim().length > 0
    ? input.envelopeId
    : input.sessionId;

  return {
    sessionId: input.sessionId,
    envelopeId,
  };
}

export function buildBridgeEnvelopeContext(input: {
  sessionId: string;
  envelopeId?: string;
  transportMode: TransportMode;
}): BridgeEnvelopeContext {
  return {
    ...toEnvelopeIdentity(input),
    transportMode: input.transportMode,
  };
}
