import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";

export type TodoToolOutput = {
  items: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed";
  }>;
};

export function executeTodoTool(input: {
  input: ToolInputMap["todo"];
}): ToolResultEnvelope<TodoToolOutput> {
  const items = input.input.items.map((item, index) => ({
    id: item.id ?? `todo-${index + 1}`,
    content: item.content,
    status: item.status ?? "pending",
  }));
  return {
    toolName: "todo",
    status: "succeeded",
    output: { items },
    metadata: { truncated: false },
  };
}
