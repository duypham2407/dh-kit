import type { TransportMode } from "./transport-mode.js";

export type ExecutionEnvelopeBridge = {
  sessionId: string;
  envelopeId: string;
  lane: string;
  role: string;
  agentId: string;
  stage: string;
  requiredTools: string[];
  providerId: string;
  modelId: string;
  variantId: string;
  activeSkills: string[];
  activeMcps: string[];
  semanticMode: string;
};

export type ExecutionEnvelopeIdentity = {
  sessionId: string;
  envelopeId: string;
};

export type BridgeEnvelopeContext = ExecutionEnvelopeIdentity & {
  transportMode: TransportMode;
};
