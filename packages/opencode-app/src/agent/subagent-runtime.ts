import type { ChatProvider } from "../../../providers/src/chat/types.js";
import type { TaskToolExecutor } from "../tools/task-tool.js";

export type SubagentTaskInput = {
  prompt: string;
  agentId?: string;
  provider?: ChatProvider;
  model?: string;
  maxResultBytes?: number;
};

export async function runSubagentTask(input: SubagentTaskInput): Promise<string> {
  const agentId = input.agentId ?? "general";
  const maxBytes = input.maxResultBytes ?? 16_000;
  if (input.provider) {
    const response = await input.provider.chat({
      messages: [
        { role: "system", content: `You are DH subagent '${agentId}'. Return a concise bounded result.` },
        { role: "user", content: input.prompt },
      ],
      model: input.model ?? "openai/gpt-5",
      temperature: 0.2,
      responseFormat: { type: "text" },
    });
    return truncateUtf8(response.content, maxBytes);
  }

  return truncateUtf8(`Subagent ${agentId}: ${input.prompt}`, maxBytes);
}

export function createSubagentTaskExecutor(input: {
  agentId?: string;
  provider?: ChatProvider;
  model?: string;
  maxResultBytes?: number;
}): TaskToolExecutor {
  return async (task) => runSubagentTask({
    prompt: task.prompt,
    agentId: task.agentId ?? input.agentId,
    provider: input.provider,
    model: input.model,
    maxResultBytes: input.maxResultBytes,
  });
}

function truncateUtf8(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, "utf8");
  if (buffer.byteLength <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString("utf8");
}
