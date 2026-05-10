import { describe, expect, it } from "vitest";
import { createMockChatProvider } from "../../../providers/src/chat/mock-chat.js";
import { createSubagentTaskExecutor, runSubagentTask } from "./subagent-runtime.js";

describe("subagent runtime", () => {
  it("returns deterministic bounded fallback output without a provider", async () => {
    const result = await runSubagentTask({
      prompt: "inspect runtime boundaries",
      agentId: "plan",
      maxResultBytes: 48,
    });

    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(48);
    expect(result).toContain("plan");
  });

  it("uses provider output when a provider is available", async () => {
    const provider = createMockChatProvider(() => "provider subagent result");

    const result = await runSubagentTask({
      prompt: "inspect",
      agentId: "docs",
      provider,
    });

    expect(result).toBe("provider subagent result");
  });

  it("creates a task-tool executor", async () => {
    const executor = createSubagentTaskExecutor({ agentId: "plan" });

    await expect(executor({ prompt: "summarize" })).resolves.toContain("plan");
  });
});
