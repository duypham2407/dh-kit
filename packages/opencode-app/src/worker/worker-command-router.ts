import { runKnowledgeCommand, type KnowledgeCommandReport } from "../workflows/run-knowledge-command.js";
import type { BridgeClient } from "../bridge/dh-jsonrpc-stdio-client.js";

export type WorkerCommandKind = "ask" | "explain" | "trace";

export type WorkerRunCommandParams = {
  command?: WorkerCommandKind;
  kind?: WorkerCommandKind;
  input?: string;
  prompt?: string;
  query?: string;
  workspaceRoot?: string;
  repoRoot?: string;
  resumeSessionId?: string;
  outputMode?: "text" | "json";
  replaySafety?: "replay_safe_read_only" | "replay_unsafe" | "uncertain";
};

export type WorkerRunCommandResult = {
  report: KnowledgeCommandReport;
};

export class WorkerCommandRouter {
  private readonly bridgeClient: BridgeClient;
  private readonly defaultRepoRoot: string;
  private cancelled = false;

  constructor(input: { bridgeClient: BridgeClient; defaultRepoRoot: string }) {
    this.bridgeClient = input.bridgeClient;
    this.defaultRepoRoot = input.defaultRepoRoot;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async close(): Promise<void> {
    await this.bridgeClient.close();
  }

  async runCommand(params: WorkerRunCommandParams): Promise<WorkerRunCommandResult> {
    if (this.cancelled) {
      return {
        report: cancelledReport({
          kind: params.command ?? params.kind ?? "ask",
          repoRoot: params.repoRoot ?? params.workspaceRoot ?? this.defaultRepoRoot,
        }),
      };
    }

    const kind = params.command ?? params.kind;
    if (!isWorkerCommandKind(kind)) {
      throw new Error("session.runCommand requires command/kind to be one of ask, explain, or trace.");
    }

    const input = params.input ?? params.prompt ?? params.query ?? "";
    const repoRoot = params.repoRoot ?? params.workspaceRoot ?? this.defaultRepoRoot;

    // TypeScript remains worker-bound here: command/report assembly is local,
    // but query/evidence operations are delegated through the Rust host-backed
    // bridge client injected below. Host lifecycle fields are not produced here.
    const report = await runKnowledgeCommand({
      kind,
      input,
      repoRoot,
      resumeSessionId: params.resumeSessionId,
      bridgeClientFactory: () => this.bridgeClient,
    });

    return { report };
  }
}

function cancelledReport(input: { kind: WorkerCommandKind; repoRoot: string }): KnowledgeCommandReport {
  return {
    exitCode: 130,
    command: input.kind,
    repo: input.repoRoot,
    intent: "cancelled_by_rust_host",
    tools: [],
    seedTerms: [],
    workspaceCount: 0,
    resultCount: 0,
    evidenceCount: 0,
    evidencePreview: [],
    message: "Command handling was cancelled by the Rust host.",
    guidance: ["Rust host owns the final cancellation lifecycle classification for this worker request."],
  };
}

function isWorkerCommandKind(value: unknown): value is WorkerCommandKind {
  return value === "ask" || value === "explain" || value === "trace";
}
