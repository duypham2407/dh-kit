import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import {
  buildBridgeEnvelopeContext,
  writeHookDecision,
  type HookDecision,
} from "../../../opencode-sdk/src/index.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import type { BashGuardDecision } from "./bash-guard.js";
import type { EvidenceGateDecision } from "./evidence-gate.js";

export class EnforcementWriter {
  private readonly logsRepo: HookInvocationLogsRepo;

  constructor(private readonly repoRoot: string) {
    this.logsRepo = new HookInvocationLogsRepo(repoRoot);
  }

  writeBashGuardDecision(input: {
    sessionId: string;
    envelopeId: string;
    command: string;
    result: BashGuardDecision;
    durationMs?: number;
  }): void {
    const decision: HookDecision = input.result.allowed ? "allow" : "block";
    writeHookDecision(this.logsRepo, {
      envelope: buildBridgeEnvelopeContext({
        sessionId: input.sessionId,
        envelopeId: input.envelopeId,
        transportMode: "sqlite",
      }),
      hookName: "pre_tool_exec",
      decision,
      reason: input.result.reason,
      payloadIn: { command: input.command },
      payloadOut: input.result,
      durationMs: input.durationMs ?? 0,
      id: createId("hook-log"),
      timestamp: nowIso(),
    });
  }

  writeEvidenceGateDecision(input: {
    sessionId: string;
    envelopeId: string;
    intent: string;
    toolsUsed: string[];
    evidenceScore: number;
    result: EvidenceGateDecision;
    durationMs?: number;
  }): void {
    const decision: HookDecision = input.result.allowed ? "allow" : "block";
    writeHookDecision(this.logsRepo, {
      envelope: buildBridgeEnvelopeContext({
        sessionId: input.sessionId,
        envelopeId: input.envelopeId,
        transportMode: "sqlite",
      }),
      hookName: "pre_answer",
      decision,
      reason: input.result.reason,
      payloadIn: {
        intent: input.intent,
        toolsUsed: input.toolsUsed,
        evidenceScore: input.evidenceScore,
      },
      payloadOut: input.result,
      durationMs: input.durationMs ?? 0,
      id: createId("hook-log"),
      timestamp: nowIso(),
    });
  }
}
