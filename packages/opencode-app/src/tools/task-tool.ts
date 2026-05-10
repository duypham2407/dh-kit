import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import type { ToolEventSink } from "./shell-tool.js";

export type TaskToolOutput = {
  result: string;
};

export type TaskToolExecutor = (input: {
  prompt: string;
  agentId?: string;
}) => Promise<string> | string;

export async function executeTaskTool(input: {
  input: ToolInputMap["task"];
  executor?: TaskToolExecutor;
  onEvent?: ToolEventSink;
}): Promise<ToolResultEnvelope<TaskToolOutput>> {
  if (!input.executor) {
    return {
      toolName: "task",
      status: "unsupported",
      error: "Task tool requires an injected task executor.",
      metadata: { truncated: false },
    };
  }

  const raw = await input.executor({
    prompt: input.input.prompt,
    agentId: input.input.agentId,
  });
  const maxBytes = input.input.maxResultBytes ?? 16_000;
  const buffer = Buffer.from(raw, "utf8");
  const returned = buffer.byteLength > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
  const result = returned.toString("utf8");
  input.onEvent?.("tool.delta", { toolName: "task", text: result });

  return {
    toolName: "task",
    status: "succeeded",
    output: { result },
    metadata: {
      truncated: buffer.byteLength > returned.byteLength,
      bytesRead: buffer.byteLength,
      bytesReturned: returned.byteLength,
      omittedBytes: Math.max(buffer.byteLength - returned.byteLength, 0),
    },
  };
}
