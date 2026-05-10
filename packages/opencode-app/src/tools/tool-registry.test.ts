import { describe, expect, it } from "vitest";
import { CORE_TOOL_NAMES, getToolDefinition, listToolDefinitions } from "./tool-registry.js";

describe("tool registry", () => {
  it("registers the milestone core tool catalog", () => {
    expect(CORE_TOOL_NAMES).toEqual([
      "read",
      "write",
      "edit",
      "shell",
      "glob",
      "grep",
      "apply_patch",
      "todo",
      "task",
      "semantic_search",
      "graph_find_symbol",
      "graph_find_references",
      "graph_call_hierarchy",
    ]);

    expect(listToolDefinitions().map((tool) => tool.name)).toEqual(CORE_TOOL_NAMES);
  });

  it("exposes permission and streaming metadata", () => {
    expect(getToolDefinition("read")).toMatchObject({
      name: "read",
      category: "read",
      defaultPermissionLevel: "auto_approve_with_policy",
      streams: false,
      executable: true,
    });
    expect(getToolDefinition("shell")).toMatchObject({
      name: "shell",
      category: "shell",
      defaultPermissionLevel: "ask",
      streams: true,
      executable: true,
    });
    expect(getToolDefinition("write")).toMatchObject({
      name: "write",
      category: "write",
      defaultPermissionLevel: "ask",
      executable: true,
    });
    expect(getToolDefinition("task")).toMatchObject({
      name: "task",
      category: "task",
      defaultPermissionLevel: "ask",
      streams: true,
    });
  });

  it("returns undefined for unknown tools", () => {
    expect(getToolDefinition("webfetch")).toBeUndefined();
  });
});
