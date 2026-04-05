/**
 * Hook Enforcer — DB-backed enforcement bridge between the TypeScript policy
 * layer and the Go runtime hook stubs.
 *
 * Design:
 * - TS enforcement decisions (allow / block / modify) are written to the
 *   `hook_invocation_logs` SQLite table.
 * - Go hook implementations read the latest decision for a given
 *   (session_id, envelope_id, hook_name) tuple before allowing or blocking
 *   the operation at process level.
 *
 * This gives a single-binary compatible path: Go reads policy decisions
 * from the same SQLite DB written by TS without a network hop or sidecar.
 */

import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { HookInvocationLog } from "../../../shared/src/types/audit.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { enforceToolUsage } from "../executor/enforce-tool-usage.js";
import { gateAnswer } from "../executor/answer-gating.js";
import type { QueryIntent } from "../planner/required-tools-policy.js";

export type HookDecision = {
  allow: boolean;
  decision: "allow" | "block" | "modify";
  reason: string;
  logId: string;
};

/**
 * Enforcer that runs TS policy logic and persists each decision to SQLite
 * so that Go runtime hooks can read and honour them.
 */
export class HookEnforcer {
  private readonly logs: HookInvocationLogsRepo;

  constructor(private readonly repoRoot: string) {
    this.logs = new HookInvocationLogsRepo(repoRoot);
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
    const result = enforceToolUsage(envelope, toolName, intent);
    const durationMs = Date.now() - start;

    const decision: HookInvocationLog["decision"] = result.allow ? "allow" : "block";
    const log: HookInvocationLog = {
      id: createId("hook"),
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      hookName: "pre_tool_exec",
      input: { toolName, toolArgs, intent },
      output: { allow: result.allow, reason: result.reason },
      decision,
      reason: result.reason,
      durationMs,
      timestamp: nowIso(),
    };
    this.logs.save(log);

    return { allow: result.allow, decision, reason: result.reason, logId: log.id };
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
    const result = gateAnswer(envelope, toolsUsed, evidenceScore, intent);
    const durationMs = Date.now() - start;

    const decision: HookInvocationLog["decision"] = result.allow ? "allow" : "block";
    const log: HookInvocationLog = {
      id: createId("hook"),
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      hookName: "pre_answer",
      input: { toolsUsed, evidenceScore, intent },
      output: { allow: result.allow, action: result.action, reason: result.reason },
      decision,
      reason: result.reason,
      durationMs,
      timestamp: nowIso(),
    };
    this.logs.save(log);

    return { allow: result.allow, decision, reason: result.reason, logId: log.id };
  }
}
