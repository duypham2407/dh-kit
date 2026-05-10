import { z } from "zod";

export const TOOL_NAMES = [
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
] as const;

export type ToolName = typeof TOOL_NAMES[number];

export type ToolCategory = "read" | "write" | "shell" | "task" | "graph";

export type ToolPermissionLevel = "deny" | "ask" | "allow" | "auto_approve_with_policy";

export type ToolResultStatus = "succeeded" | "failed" | "permission_required" | "unsupported";

export type ToolResultMetadata = {
  truncated: boolean;
  bytesRead?: number;
  bytesReturned?: number;
  omittedBytes?: number;
  exitCode?: number | null;
  durationMs?: number;
  diffSummary?: {
    filesChanged: number;
    additions: number;
    deletions: number;
    paths: string[];
  };
};

export type ToolResultEnvelope<TOutput = unknown> = {
  toolName: ToolName;
  status: ToolResultStatus;
  output?: TOutput;
  error?: string;
  metadata: ToolResultMetadata;
};

const nonEmptyString = z.string().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

export const ToolInputSchemas = {
  read: z.object({
    path: nonEmptyString,
    offset: nonNegativeInteger.optional(),
    limit: positiveInteger.optional(),
    maxBytes: positiveInteger.optional(),
  }).strict(),
  write: z.object({
    path: nonEmptyString,
    content: z.string(),
    createDirs: z.boolean().optional(),
  }).strict(),
  edit: z.object({
    path: nonEmptyString,
    oldText: nonEmptyString,
    newText: z.string(),
    replaceAll: z.boolean().optional(),
  }).strict(),
  shell: z.object({
    command: nonEmptyString,
    cwd: nonEmptyString.optional(),
    timeoutMs: positiveInteger.optional(),
    maxOutputBytes: positiveInteger.optional(),
  }).strict(),
  glob: z.object({
    pattern: nonEmptyString,
    cwd: nonEmptyString.optional(),
    limit: positiveInteger.optional(),
  }).strict(),
  grep: z.object({
    pattern: nonEmptyString,
    include: nonEmptyString.optional(),
    cwd: nonEmptyString.optional(),
    limit: positiveInteger.optional(),
    caseSensitive: z.boolean().optional(),
  }).strict(),
  apply_patch: z.object({
    patch: nonEmptyString,
  }).strict(),
  todo: z.object({
    items: z.array(z.object({
      id: nonEmptyString.optional(),
      content: nonEmptyString,
      status: z.enum(["pending", "in_progress", "completed"]).optional(),
    }).strict()).min(1),
  }).strict(),
  task: z.object({
    prompt: nonEmptyString,
    agentId: nonEmptyString.optional(),
    maxResultBytes: positiveInteger.optional(),
  }).strict(),
  semantic_search: z.object({
    query: nonEmptyString,
    limit: positiveInteger.optional(),
  }).strict(),
  graph_find_symbol: z.object({
    symbol: nonEmptyString,
    limit: positiveInteger.optional(),
  }).strict(),
  graph_find_references: z.object({
    symbol: nonEmptyString,
    limit: positiveInteger.optional(),
  }).strict(),
  graph_call_hierarchy: z.object({
    symbol: nonEmptyString,
    direction: z.enum(["incoming", "outgoing", "both"]).optional(),
    limit: positiveInteger.optional(),
  }).strict(),
} as const;

export type ToolInputMap = {
  [K in ToolName]: z.infer<typeof ToolInputSchemas[K]>;
};

export type ParsedToolInput<TName extends ToolName = ToolName> =
  | { ok: true; value: ToolInputMap[TName] }
  | { ok: false; error: string; issues: string[] };

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

export function parseToolInput<TName extends ToolName>(toolName: TName, input: unknown): ParsedToolInput<TName>;
export function parseToolInput(toolName: string, input: unknown): ParsedToolInput;
export function parseToolInput(toolName: string, input: unknown): ParsedToolInput {
  if (!isToolName(toolName)) {
    return { ok: false, error: `Unknown tool '${toolName}'.`, issues: [`Unknown tool '${toolName}'.`] };
  }

  const result = ToolInputSchemas[toolName].safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => issue.message);
    return {
      ok: false,
      error: `${toolName} input is invalid: ${issues.join("; ")}`,
      issues,
    };
  }

  return { ok: true, value: result.data };
}
