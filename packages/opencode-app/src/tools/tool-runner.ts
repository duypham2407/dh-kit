import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { ToolUsageAudit } from "../../../shared/src/types/audit.js";
import type { RunEventPayload, RunEventType } from "../../../shared/src/types/run.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";
import { executeApplyPatchTool } from "./apply-patch-tool.js";
import { executeEditTool } from "./edit-tool.js";
import { executeReadTool } from "./read-tool.js";
import { executeGlobTool, executeGrepTool } from "./search-tool.js";
import { executeShellTool } from "./shell-tool.js";
import type { TaskToolExecutor } from "./task-tool.js";
import { executeTaskTool } from "./task-tool.js";
import { executeTodoTool } from "./todo-tool.js";
import { getToolDefinition, type ToolDefinition } from "./tool-registry.js";
import { executeWriteTool } from "./write-tool.js";
import {
  parseToolInput,
  type ToolInputMap,
  type ToolName,
  type ToolPermissionLevel,
  type ToolResultEnvelope,
} from "./schemas.js";

export type ToolRunnerEventSink = (type: RunEventType, payload: RunEventPayload) => void;

export type ToolRunnerOptions = {
  repoRoot: string;
  envelope: ExecutionEnvelopeState;
  intent: string;
  permissionOverrides?: Partial<Record<ToolName, ToolPermissionLevel>>;
  onEvent?: ToolRunnerEventSink;
  taskExecutor?: TaskToolExecutor;
};

export class ToolRunner {
  private readonly auditRepo: ToolUsageAuditRepo;

  constructor(private readonly options: ToolRunnerOptions) {
    this.auditRepo = new ToolUsageAuditRepo(options.repoRoot);
  }

  async run(toolName: string, rawInput: unknown): Promise<ToolResultEnvelope> {
    const definition = getToolDefinition(toolName);
    if (!definition) {
      this.recordAudit(toolName, "failed");
      return {
        toolName: toolName as ToolName,
        status: "failed",
        error: `Unknown tool '${toolName}'.`,
        metadata: { truncated: false },
      };
    }

    this.recordAudit(definition.name, "called");
    const parsed = parseToolInput(definition.name, rawInput);
    if (!parsed.ok) {
      const result = failedResult(definition.name, parsed.error);
      this.recordAudit(definition.name, "failed");
      return result;
    }

    const permissionLevel = this.options.permissionOverrides?.[definition.name] ?? definition.defaultPermissionLevel;
    const permission = evaluateToolPermission(definition, permissionLevel);
    if (!permission.allowed) {
      if (permission.requiresPermission) {
        this.options.onEvent?.("permission.requested", {
          toolName: definition.name,
          permissionLevel,
          reason: permission.reason,
        });
      }
      const result: ToolResultEnvelope = {
        toolName: definition.name,
        status: permission.requiresPermission ? "permission_required" : "failed",
        error: permission.reason,
        metadata: { truncated: false },
      };
      this.recordAudit(definition.name, "failed");
      return result;
    }
    if (definition.category === "write" && !isWriteOwner(this.options.envelope)) {
      const result: ToolResultEnvelope = {
        toolName: definition.name,
        status: "failed",
        error: "Only the Fullstack Agent can execute write tools; reviewer, tester, and read-only roles must report findings through artifacts.",
        metadata: { truncated: false },
      };
      this.recordAudit(definition.name, "failed");
      return result;
    }

    this.options.onEvent?.("tool.started", { toolName: definition.name, tool: definition.name });
    const result = await this.dispatch(definition.name, parsed.value as ToolInputMap[ToolName], permissionLevel);
    this.options.onEvent?.("tool.finished", {
      toolName: definition.name,
      tool: definition.name,
      status: result.status,
      metadata: result.metadata,
    });
    this.recordAudit(definition.name, result.status === "succeeded" ? "succeeded" : "failed");
    return result;
  }

  private async dispatch(
    toolName: ToolName,
    input: ToolInputMap[ToolName],
    permissionLevel: ToolPermissionLevel,
  ): Promise<ToolResultEnvelope> {
    switch (toolName) {
      case "read":
        return executeReadTool({ repoRoot: this.options.repoRoot, input: input as ToolInputMap["read"] });
      case "write":
        return executeWriteTool({ repoRoot: this.options.repoRoot, input: input as ToolInputMap["write"] });
      case "edit":
        return executeEditTool({ repoRoot: this.options.repoRoot, input: input as ToolInputMap["edit"] });
      case "glob":
        return executeGlobTool({ repoRoot: this.options.repoRoot, input: input as ToolInputMap["glob"] });
      case "grep":
        return executeGrepTool({ repoRoot: this.options.repoRoot, input: input as ToolInputMap["grep"] });
      case "shell":
        return await executeShellTool({
          repoRoot: this.options.repoRoot,
          input: input as ToolInputMap["shell"],
          permissionLevel,
          onEvent: this.options.onEvent,
        });
      case "todo":
        return executeTodoTool({ input: input as ToolInputMap["todo"] });
      case "task":
        return await executeTaskTool({
          input: input as ToolInputMap["task"],
          executor: this.options.taskExecutor,
          onEvent: this.options.onEvent,
        });
      case "apply_patch":
        return executeApplyPatchTool({ repoRoot: this.options.repoRoot, input: input as ToolInputMap["apply_patch"] });
      case "semantic_search":
      case "graph_find_symbol":
      case "graph_find_references":
      case "graph_call_hierarchy":
        return {
          toolName,
          status: "unsupported",
          error: `Tool '${toolName}' is catalogued but not executable in this milestone.`,
          metadata: { truncated: false },
        };
    }
  }

  private recordAudit(toolName: string, status: ToolUsageAudit["status"]): void {
    this.auditRepo.save({
      id: createId("tool-audit"),
      sessionId: this.options.envelope.sessionId,
      envelopeId: this.options.envelope.id,
      role: this.options.envelope.role,
      intent: this.options.intent,
      toolName,
      status,
      timestamp: nowIso(),
    });
  }
}

function evaluateToolPermission(
  definition: ToolDefinition,
  permissionLevel: ToolPermissionLevel,
): { allowed: boolean; requiresPermission: boolean; reason: string } {
  if (permissionLevel === "deny") {
    return {
      allowed: false,
      requiresPermission: false,
      reason: `Tool '${definition.name}' is denied by permission policy.`,
    };
  }
  if (permissionLevel === "ask") {
    return {
      allowed: false,
      requiresPermission: true,
      reason: `Tool '${definition.name}' requires permission before execution.`,
    };
  }
  if (permissionLevel === "allow") {
    return { allowed: true, requiresPermission: false, reason: "Tool explicitly allowed." };
  }
  if (definition.defaultPermissionLevel === "auto_approve_with_policy") {
    return { allowed: true, requiresPermission: false, reason: "Tool auto-approved by policy." };
  }
  return {
    allowed: false,
    requiresPermission: true,
    reason: `Tool '${definition.name}' requires permission before automatic execution.`,
  };
}

function isWriteOwner(envelope: ExecutionEnvelopeState): boolean {
  return envelope.role === "implementer"
    || envelope.agentId === "implementer"
    || envelope.agentId === "fullstack_agent";
}

function failedResult(toolName: ToolName, error: string): ToolResultEnvelope {
  return {
    toolName,
    status: "failed",
    error,
    metadata: { truncated: false },
  };
}
