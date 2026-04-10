export { BRIDGE_PROTOCOL_VERSION } from "./protocol/versioning.js";

export type { OpenCodeBridgeMessage } from "./types/protocol.js";
export type { TransportMode } from "./types/transport-mode.js";
export type {
  HookDecision,
  HookDecisionRecord,
  HookDecisionRow,
  HookName,
  ModelOverridePayload,
  PreAnswerPayload,
  PreToolExecPayload,
  SkillActivationPayload,
  McpRoutingPayload,
} from "./types/hook-decision.js";
export type {
  BridgeEnvelopeContext,
  ExecutionEnvelopeBridge,
  ExecutionEnvelopeIdentity,
} from "./types/envelope.js";
export type {
  DhSessionStateBridge,
  DhSessionStateBridgeSnakeCase,
} from "./types/session.js";
export type {
  ResolvedModelBridge,
  ResolvedModelBridgeSnakeCase,
} from "./types/model.js";

export type { BridgeError, BridgeResult } from "./protocol/error-envelope.js";

export { buildBridgeEnvelopeContext, toEnvelopeIdentity } from "./protocol/envelope-contract.js";
export { normalizePayloadKeys } from "./protocol/key-normalization.js";
export { serializeBridgePayload, deserializeBridgePayload } from "./protocol/serialization.js";
export { normalizeToCamelCase, normalizeToSnakeCase } from "./compat/key-normalizer.js";

export type { HookDecisionInput } from "./client/decision-writer.js";
export { writeHookDecision } from "./client/decision-writer.js";
export { writeSessionStateDecision } from "./client/session-client.js";
export { writeModelOverrideDecision } from "./client/model-client.js";
export { writeSkillActivationDecision } from "./client/skill-client.js";
export { writeMcpRoutingDecision } from "./client/mcp-client.js";
export { buildFilesystemMirrorPayload } from "./client/filesystem-client.js";
export { buildDelegatedCliCommand } from "./client/cli-client.js";
export { NotImplementedIpcClient } from "./client/ipc-stub.js";
export type { BridgeIpcClient } from "./client/ipc-stub.js";
export type { FilesystemMirrorPayload } from "./client/filesystem-client.js";
export type { DelegatedCliCommand } from "./client/cli-client.js";

export type {
  HookInvocationLog,
  ExecutionEnvelopeState,
  SessionState,
  ResolvedModelSelection,
} from "./compat/legacy-shims.js";
