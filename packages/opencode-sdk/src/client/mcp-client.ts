import type { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import type {
  ExtensionDecisionKind,
  ExtensionReasonCode,
} from "../types/extension-contract.js";
import { buildBridgeEnvelopeContext } from "../protocol/envelope-contract.js";
import type { BridgeResult } from "../protocol/error-envelope.js";
import { writeHookDecision } from "./decision-writer.js";

export function writeMcpRoutingDecision(
  repo: HookInvocationLogsRepo,
  input: {
    sessionId: string;
    envelopeId?: string;
    intent: string;
    mcps: string[];
    blocked?: string[];
    warnings?: string[];
    decisions?: Record<string, ExtensionDecisionKind>;
    reasons?: Record<string, ExtensionReasonCode[]>;
    rejected?: Record<string, ExtensionReasonCode[]>;
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
    hookName: "mcp_routing",
    decision: "allow",
    reason: input.reason ?? "mcp routing selected",
    payloadIn: {
      intent: input.intent,
    },
    payloadOut: {
      mcps: input.mcps,
      blocked: input.blocked ?? [],
      warnings: input.warnings ?? [],
      decisions: input.decisions ?? {},
      reasons: input.reasons ?? {},
      rejected: input.rejected ?? {},
    },
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, value: { id: result.value.id } };
}
