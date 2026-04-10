import type { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { buildBridgeEnvelopeContext } from "../protocol/envelope-contract.js";
import type { BridgeResult } from "../protocol/error-envelope.js";
import { writeHookDecision } from "./decision-writer.js";

export function writeSkillActivationDecision(
  repo: HookInvocationLogsRepo,
  input: {
    sessionId: string;
    envelopeId?: string;
    lane: string;
    role: string;
    skills: string[];
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
    hookName: "skill_activation",
    decision: "allow",
    reason: input.reason ?? "skills selected",
    payloadIn: {
      lane: input.lane,
      role: input.role,
    },
    payloadOut: {
      skills: input.skills,
    },
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, value: { id: result.value.id } };
}
