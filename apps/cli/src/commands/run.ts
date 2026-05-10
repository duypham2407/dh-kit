import type { RunDirectInput } from "../../../../packages/shared/src/types/run.js";
import { renderRunNdjson, renderRunText } from "../presenters/run-event.js";
import { createRuntimeClient, type RuntimeClient } from "../runtime-client.js";

type ParsedRunArgs = RunDirectInput & {
  json: boolean;
  multi: boolean;
};

export async function runRunCommand(
  args: string[],
  repoRoot: string,
  runtime: RuntimeClient = createRuntimeClient(),
): Promise<number> {
  const parsed = parseRunArgs(args, repoRoot);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const { json, multi, ...input } = parsed.value;
  if (multi) {
    const report = await runtime.runFullWorkflow({ repoRoot, objective: input.message });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderFullWorkflowText(report)}\n`);
    return 0;
  }

  const report = await runtime.runDirect(input);
  const output = json ? renderRunNdjson(report) : renderRunText(report);
  if (report.exitCode === 0) {
    process.stdout.write(`${output}\n`);
  } else {
    process.stderr.write(`${output}\n`);
  }
  return report.exitCode;
}

function parseRunArgs(args: string[], repoRoot: string): { ok: true; value: ParsedRunArgs } | { ok: false; error: string } {
  const messageParts: string[] = [];
  const files: string[] = [];
  let json = false;
  let multi = false;
  let continueLatest = false;
  let sessionId: string | undefined;
  let fork = false;
  let model: string | undefined;
  let agentId: string | undefined;
  let variant: string | undefined;
  let title: string | undefined;
  let autoApprove = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--multi") {
      multi = true;
    } else if (arg === "--continue") {
      continueLatest = true;
    } else if (arg === "--fork") {
      fork = true;
    } else if (arg === "--auto-approve") {
      autoApprove = true;
    } else if (arg === "--session") {
      const value = args[index + 1];
      if (!value) return { ok: false, error: "--session requires a value." };
      sessionId = value;
      index += 1;
    } else if (arg === "--model") {
      const value = args[index + 1];
      if (!value) return { ok: false, error: "--model requires a provider/model value." };
      model = value;
      index += 1;
    } else if (arg === "--agent") {
      const value = args[index + 1];
      if (!value) return { ok: false, error: "--agent requires an agent id." };
      agentId = value;
      index += 1;
    } else if (arg === "--variant") {
      const value = args[index + 1];
      if (!value) return { ok: false, error: "--variant requires a variant id." };
      variant = value;
      index += 1;
    } else if (arg === "--file") {
      const value = args[index + 1];
      if (!value) return { ok: false, error: "--file requires a path." };
      files.push(value);
      index += 1;
    } else if (arg === "--title") {
      const value = args[index + 1];
      if (!value) return { ok: false, error: "--title requires text." };
      title = value;
      index += 1;
    } else {
      messageParts.push(arg);
    }
  }

  if (continueLatest && sessionId) {
    return { ok: false, error: "--continue cannot be combined with --session." };
  }
  if (fork && !sessionId) {
    return { ok: false, error: "--fork requires --session <id>." };
  }
  if (model && !model.includes("/")) {
    return { ok: false, error: "--model must use provider/model format." };
  }
  if (variant && !model && !agentId) {
    return { ok: false, error: "--variant requires --model or --agent." };
  }

  const message = messageParts.join(" ").trim();
  if (!message && !continueLatest && !sessionId) {
    return { ok: false, error: "dh run requires a message unless --continue or --session is used." };
  }

  return {
    ok: true,
    value: {
      message,
      repoRoot,
      continueLatest,
      sessionId,
      fork,
      model,
      agentId,
      variant,
      files,
      title,
      autoApprove,
      json,
      multi,
    },
  };
}

function renderFullWorkflowText(report: Awaited<ReturnType<RuntimeClient["runFullWorkflow"]>>): string {
  return [
    `parent session: ${report.parentSessionId}`,
    `stage: ${report.state.currentStage}`,
    `owner: ${report.state.currentOwner}`,
    `status: ${report.state.status}`,
  ].join("\n");
}
