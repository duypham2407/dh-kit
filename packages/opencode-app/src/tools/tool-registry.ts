import { TOOL_NAMES, type ToolCategory, type ToolName, type ToolPermissionLevel } from "./schemas.js";

export const CORE_TOOL_NAMES = TOOL_NAMES;

export type ToolDefinition = {
  name: ToolName;
  description: string;
  category: ToolCategory;
  defaultPermissionLevel: ToolPermissionLevel;
  streams: boolean;
  executable: boolean;
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read",
    description: "Read a UTF-8 text file from the current repository.",
    category: "read",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: true,
  },
  {
    name: "write",
    description: "Create or replace a UTF-8 text file in the current repository.",
    category: "write",
    defaultPermissionLevel: "ask",
    streams: false,
    executable: true,
  },
  {
    name: "edit",
    description: "Replace exact text in a repository file.",
    category: "write",
    defaultPermissionLevel: "ask",
    streams: false,
    executable: true,
  },
  {
    name: "shell",
    description: "Run a shell command through DH permission and bash guard policy.",
    category: "shell",
    defaultPermissionLevel: "ask",
    streams: true,
    executable: true,
  },
  {
    name: "glob",
    description: "Find repository files matching a glob-like pattern.",
    category: "read",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: true,
  },
  {
    name: "grep",
    description: "Search repository text files for a literal or regex pattern.",
    category: "read",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: true,
  },
  {
    name: "apply_patch",
    description: "Apply a structured patch to repository files.",
    category: "write",
    defaultPermissionLevel: "ask",
    streams: false,
    executable: true,
  },
  {
    name: "todo",
    description: "Return a normalized non-persistent todo state for the current run.",
    category: "task",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: true,
  },
  {
    name: "task",
    description: "Run a bounded subtask through an injected task executor.",
    category: "task",
    defaultPermissionLevel: "ask",
    streams: true,
    executable: true,
  },
  {
    name: "semantic_search",
    description: "Search DH semantic evidence for a query.",
    category: "read",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: false,
  },
  {
    name: "graph_find_symbol",
    description: "Find a symbol through DH graph intelligence.",
    category: "graph",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: false,
  },
  {
    name: "graph_find_references",
    description: "Find symbol references through DH graph intelligence.",
    category: "graph",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: false,
  },
  {
    name: "graph_call_hierarchy",
    description: "Find call hierarchy through DH graph intelligence.",
    category: "graph",
    defaultPermissionLevel: "auto_approve_with_policy",
    streams: false,
    executable: false,
  },
];

export function listToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map((tool) => ({ ...tool }));
}

export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  const tool = TOOL_DEFINITIONS.find((definition) => definition.name === toolName);
  return tool ? { ...tool } : undefined;
}
