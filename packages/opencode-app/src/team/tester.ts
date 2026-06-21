import type { TesterOutputState } from "../../../shared/src/types/role-output.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import type { RunEventPayload, RunEventType } from "../../../shared/src/types/run.js";
import {
  detectVerificationCommands,
  type VerificationCommand,
} from "../../../intelligence/src/workspace/detect-verification-commands.js";
import { runBrowserVerification } from "../browser/verification.js";
import { ToolRunner } from "../tools/tool-runner.js";
import type { ShellToolOutput } from "../tools/shell-tool.js";

export type TesterEventSink = (type: RunEventType, payload: RunEventPayload) => void;

export type TesterInput = {
  objective?: string;
  acceptanceCriteria?: string[];
  validationPlan?: string[];
  requiredMcps?: string[];
  browserEvidencePolicy?: "required" | "optional";
  browserVerificationRequired?: boolean;
  provider?: ChatProvider;
  /** Target repo the user is working in. Required to run REAL verification commands. */
  repoRoot?: string;
  /** Execution envelope, threaded so tool runs are audited under the right session/role. */
  envelope?: ExecutionEnvelopeState;
  onEvent?: TesterEventSink;
};

const STDERR_TAIL_LIMIT = 1_200;

/**
 * Run real verification on the target repo and emit a grounded verdict.
 *
 * The tester NEVER fabricates a pass. It detects the repo's own verify commands
 * (typecheck/build/lint/test) and executes them through the audited ToolRunner shell tool,
 * reading real exit codes. A non-zero exit (or a failed tool run) is a hard FAIL that routes
 * back to the implementer. When no command can be detected, the verdict is PARTIAL with an
 * explicit limitation — not a fake PASS.
 */
export async function runTester(input?: TesterInput): Promise<TesterOutputState> {
  if (!input?.repoRoot || !input.envelope) {
    // No repo context (e.g. called outside a workflow). We cannot execute anything, so be
    // honest about it instead of claiming a pass.
    return noRepoContextVerdict(input);
  }

  const browser = runBrowserVerification({
    objective: input.objective,
    routedMcps: input.requiredMcps ?? [],
    evidencePolicy: input.browserEvidencePolicy ?? "optional",
  });

  const commands = await detectVerificationCommands(input.repoRoot);

  const executedChecks: string[] = [];
  const evidence: string[] = [];
  const unmetCriteria: string[] = [];
  const limitations: string[] = [];

  let commandFailed = false;

  if (commands.length === 0) {
    limitations.push("No verification command detected for this repository.");
  } else {
    const runner = new ToolRunner({
      repoRoot: input.repoRoot,
      envelope: input.envelope,
      intent: "verification",
      permissionOverrides: { shell: "auto_approve_with_policy" },
      onEvent: input.onEvent,
    });

    for (const command of commands) {
      const result = await runner.run("shell", {
        command: command.command,
        timeoutMs: command.timeoutMs,
      });

      const output = result.output as ShellToolOutput | undefined;
      const exitCode = output?.exitCode ?? result.metadata.exitCode ?? null;
      const passed = result.status === "succeeded" && exitCode === 0;

      executedChecks.push(`${describeCommand(command)} (exit ${exitCode ?? "unknown"})`);

      if (passed) {
        evidence.push(`${command.command} passed (exit 0)`);
        continue;
      }

      commandFailed = true;
      const stderrTail = tail(output?.stderr ?? "", STDERR_TAIL_LIMIT);
      evidence.push(`${command.command} failed (exit ${exitCode ?? "unknown"})`);
      unmetCriteria.push(
        stderrTail
          ? `${command.command} failed: ${stderrTail}`
          : `${command.command} failed with exit ${exitCode ?? "unknown"}.`,
      );
      if (result.error) {
        limitations.push(`${command.command}: ${result.error}`);
      }
      // Fail fast — once a gate fails, stop and route back to the implementer.
      break;
    }
  }

  if (browser.required) {
    executedChecks.push("Browser verification routing", ...browser.executedChecks);
    evidence.push(...browser.evidence);
    limitations.push(...browser.limitations);
  }

  const browserBlocked = browser.required && !browser.pass;
  if (browserBlocked) {
    unmetCriteria.push("Required browser verification did not produce routed browser evidence.");
  }

  const status = deriveStatus({
    commandFailed,
    hasCommands: commands.length > 0,
    browserBlocked,
  });
  // A failing verify command or a missing-but-required browser check both route back to the
  // implementer so the loop self-heals; only a clean result completes.
  const nextAction: TesterOutputState["nextAction"] = status === "FAIL" || browserBlocked
    ? "implementer"
    : "complete";

  return {
    status,
    executedChecks,
    evidence,
    unmetCriteria,
    limitations,
    nextAction,
  };
}

function deriveStatus(input: {
  commandFailed: boolean;
  hasCommands: boolean;
  browserBlocked: boolean;
}): TesterOutputState["status"] {
  if (input.commandFailed) {
    return "FAIL";
  }
  if (!input.hasCommands || input.browserBlocked) {
    return "PARTIAL";
  }
  return "PASS";
}

function noRepoContextVerdict(input?: TesterInput): TesterOutputState {
  const browser = runBrowserVerification({
    objective: input?.objective,
    routedMcps: input?.requiredMcps ?? [],
    evidencePolicy: input?.browserEvidencePolicy ?? "optional",
  });

  const executedChecks: string[] = [];
  const evidence = ["No repository context provided — verification was not executed."];
  const limitations = ["Tester ran without a repo context; no verification command was executed."];
  const unmetCriteria: string[] = [];

  const browserBlocked = browser.required && !browser.pass;
  if (browser.required) {
    executedChecks.push("Browser verification routing", ...browser.executedChecks);
    evidence.push(...browser.evidence);
    limitations.push(...browser.limitations);
    if (browserBlocked) {
      unmetCriteria.push("Required browser verification did not produce routed browser evidence.");
    }
  }

  return {
    status: "PARTIAL",
    executedChecks,
    evidence,
    unmetCriteria,
    limitations,
    nextAction: browserBlocked ? "implementer" : "complete",
  };
}

function describeCommand(command: VerificationCommand): string {
  return `${command.kind}: ${command.command}`;
}

function tail(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `…${trimmed.slice(trimmed.length - limit)}`;
}
