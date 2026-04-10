import type { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import type { BridgeEnvelopeContext } from "../types/envelope.js";
import type { HookDecision, HookDecisionRecord, HookName } from "../types/hook-decision.js";
import type { BridgeResult } from "../protocol/error-envelope.js";
import { normalizeToSnakeCase } from "../compat/key-normalizer.js";

export type HookDecisionInput = {
  envelope: BridgeEnvelopeContext;
  hookName: HookName;
  decision: HookDecision;
  reason: string;
  payloadIn: Record<string, unknown>;
  payloadOut: Record<string, unknown>;
  durationMs?: number;
  id?: string;
  timestamp?: string;
};

export function writeHookDecision(
  repo: HookInvocationLogsRepo,
  input: HookDecisionInput,
): BridgeResult<HookDecisionRecord> {
  try {
    const record: HookDecisionRecord = {
      id: input.id ?? createId("hook-log"),
      sessionId: input.envelope.sessionId,
      envelopeId: input.envelope.envelopeId,
      hookName: input.hookName,
      input: normalizeToSnakeCase(input.payloadIn),
      output: normalizeToSnakeCase(input.payloadOut),
      decision: input.decision,
      reason: input.reason,
      durationMs: input.durationMs ?? 0,
      timestamp: input.timestamp ?? nowIso(),
    };

    repo.save(record);
    return { ok: true, value: record };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "bridge.decision_write_failed",
        message: error instanceof Error ? error.message : "Unknown decision write error",
        hookName: input.hookName,
      },
    };
  }
}
