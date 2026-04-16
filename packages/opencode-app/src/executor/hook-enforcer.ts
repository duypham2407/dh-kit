/**
 * Hook Enforcer — DB-backed enforcement bridge between the TypeScript policy
 * layer and runtime hook stubs.
 *
 * Design:
 * - TS enforcement decisions (allow / block / modify) are written to the
 *   `hook_invocation_logs` SQLite table.
 * - Runtime hook implementations read the latest decision for a given
 *   (session_id, envelope_id, hook_name) tuple before allowing or blocking
 *   the operation at process level.
 *
 * This gives a single-binary compatible path: runtime hook handlers read policy decisions
 * from the same SQLite DB written by TS without a network hop or sidecar.
 */

import { createId } from "../../../shared/src/utils/ids.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { HookDecision as BridgeHookDecision } from "../../../opencode-sdk/src/index.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { buildBridgeEnvelopeContext, writeHookDecision } from "../../../opencode-sdk/src/index.js";
import { enforceToolUsage } from "../executor/enforce-tool-usage.js";
import { gateAnswer } from "../executor/answer-gating.js";
import { RuntimeEnforcer } from "../../../runtime/src/hooks/runtime-enforcer.js";
import type { QueryIntent } from "../planner/required-tools-policy.js";

export type HookDecision = {
  allow: boolean;
  decision: BridgeHookDecision;
  reason: string;
  logId: string;
};

/**
 * Enforcer that runs TS policy logic and persists each decision to SQLite
 * so that runtime hook handlers can read and honour them.
 */
export class HookEnforcer {
  private readonly logs: HookInvocationLogsRepo;
  private readonly runtimeEnforcer: RuntimeEnforcer;

  constructor(private readonly repoRoot: string) {
    this.logs = new HookInvocationLogsRepo(repoRoot);
    this.runtimeEnforcer = new RuntimeEnforcer(repoRoot);
  }

  /**
   * Evaluate the pre_tool_exec hook: check whether a tool call is allowed
   * for the current envelope and intent. Persists the decision to the DB.
   */
  preToolExec(
    envelope: ExecutionEnvelopeState,
    toolName: string,
    toolArgs: Record<string, unknown>,
    intent: QueryIntent = "broad_codebase_question",
  ): HookDecision {
    const start = Date.now();
    const baselineResult = enforceToolUsage(envelope, toolName, intent);
    if (!baselineResult.allow) {
      const decision: BridgeHookDecision = "block";
      const writeResult = writeHookDecision(this.logs, {
        envelope: buildBridgeEnvelopeContext({
          sessionId: envelope.sessionId,
          envelopeId: envelope.id,
          transportMode: "sqlite",
        }),
        hookName: "pre_tool_exec",
        decision,
        reason: baselineResult.reason,
        payloadIn: { toolName, toolArgs, intent, source: "baseline" },
        payloadOut: { allow: baselineResult.allow, reason: baselineResult.reason },
        durationMs: Date.now() - start,
        id: createId("hook"),
      });

      const logId = writeResult.ok ? writeResult.value.id : createId("hook-failed");
      return { allow: false, decision, reason: baselineResult.reason, logId };
    }

    const result = this.runtimeEnforcer.preToolExec({
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      role: envelope.role,
      intent,
      toolName,
      toolArgs,
    });

    const latest = this.logs.findLatestDecision(envelope.sessionId, envelope.id, "pre_tool_exec");
    const decision: BridgeHookDecision = result.allow ? "allow" : "block";
    return {
      allow: result.allow,
      decision,
      reason: result.reason,
      logId: latest?.id ?? createId("hook-failed"),
    };
  }

  /**
   * Evaluate the pre_answer hook: gate whether the agent answer is ready
   * to be delivered based on tool usage and evidence score.
   */
  preAnswer(
    envelope: ExecutionEnvelopeState,
    toolsUsed: string[],
    evidenceScore: number,
    intent: QueryIntent = "broad_codebase_question",
  ): HookDecision {
    const start = Date.now();
    const baselineResult = gateAnswer(envelope, toolsUsed, evidenceScore, intent);
    if (!baselineResult.allow) {
      const decision: BridgeHookDecision = "block";
      const writeResult = writeHookDecision(this.logs, {
        envelope: buildBridgeEnvelopeContext({
          sessionId: envelope.sessionId,
          envelopeId: envelope.id,
          transportMode: "sqlite",
        }),
        hookName: "pre_answer",
        decision,
        reason: baselineResult.reason,
        payloadIn: { toolsUsed, evidenceScore, intent, source: "baseline" },
        payloadOut: {
          allow: baselineResult.allow,
          action: baselineResult.action,
          reason: baselineResult.reason,
        },
        durationMs: Date.now() - start,
        id: createId("hook"),
      });

      const logId = writeResult.ok ? writeResult.value.id : createId("hook-failed");
      return { allow: false, decision, reason: baselineResult.reason, logId };
    }

    const structuralIntentText = intent.replaceAll("_", " ");
    const result = this.runtimeEnforcer.preAnswer({
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      intentText: structuralIntentText,
      toolsUsed,
      evidenceScore,
    });

    const latest = this.logs.findLatestDecision(envelope.sessionId, envelope.id, "pre_answer");
    const decision: BridgeHookDecision = result.allow ? "allow" : "block";
    return {
      allow: result.allow,
      decision,
      reason: result.reason,
      logId: latest?.id ?? createId("hook-failed"),
    };
  }
}
