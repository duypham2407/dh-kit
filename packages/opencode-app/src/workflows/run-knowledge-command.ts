import { runRetrieval } from "../../../retrieval/src/query/run-retrieval.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { KnowledgeCommandSessionBridge } from "../../../runtime/src/session/knowledge-command-session-bridge.js";

export type KnowledgeCommandReport = {
  exitCode: number;
  command: "ask" | "explain" | "trace";
  repo: string;
  intent: string;
  tools: string[];
  seedTerms: string[];
  workspaceCount: number;
  resultCount: number;
  evidenceCount: number;
  evidencePreview: string[];
  sessionId?: string;
  resumed?: boolean;
  compaction?: {
    attempted: boolean;
    overflow: boolean;
    compacted: boolean;
    continuationSummaryGeneratedInMemory: boolean;
    continuationSummaryPersisted: boolean;
  };
  persistence?: {
    attempted: boolean;
    persisted: boolean;
    warning?: string;
    eventId?: string;
  };
  message?: string;
  guidance?: string[];
};

export async function runKnowledgeCommand(input: {
  kind: "ask" | "explain" | "trace";
  input: string;
  repoRoot: string;
  resumeSessionId?: string;
}): Promise<KnowledgeCommandReport> {
  if (!input.input) {
    return {
      exitCode: 1,
      command: input.kind,
      repo: input.repoRoot,
      intent: "",
      tools: [],
      seedTerms: [],
      workspaceCount: 0,
      resultCount: 0,
      evidenceCount: 0,
      evidencePreview: [],
      message: `Missing input for '${input.kind}' command.`,
      guidance: [`Example: dh ${input.kind} "how does authentication work?"`],
    };
  }

  const bridge = new KnowledgeCommandSessionBridge(input.repoRoot);
  const resolved = bridge.resolveSession({
    kind: input.kind,
    prompt: input.input,
    resumeSessionId: input.resumeSessionId,
  });

  if (!resolved.ok) {
    return {
      exitCode: 1,
      command: input.kind,
      repo: input.repoRoot,
      intent: "",
      tools: [],
      seedTerms: [],
      workspaceCount: 0,
      resultCount: 0,
      evidenceCount: 0,
      evidencePreview: [],
      message: resolved.reason,
    };
  }

  const retrieval = await runRetrieval({
    repoRoot: input.repoRoot,
    query: input.input,
    mode: input.kind,
    semanticMode: "always",
  });

  const guidance: string[] = [];

  if (retrieval.results.length === 0) {
    let chunkCount = 0;
    let embeddingCount = 0;
    try {
      chunkCount = new ChunksRepo(input.repoRoot).count();
      embeddingCount = new EmbeddingsRepo(input.repoRoot).countByModel("text-embedding-3-small");
    } catch {
      // ignore guidance probe failures
    }

    if (chunkCount === 0) {
      guidance.push(`No indexed chunks found. Run: dh index`);
    } else if (embeddingCount === 0) {
      guidance.push(`Chunks exist but no embeddings were found. Run: dh index`);
    }

    guidance.push(`Try a more specific query or symbol name.`);
    guidance.push(`Check runtime health with: dh doctor`);
  }

  return {
    exitCode: 0,
    command: input.kind,
    repo: input.repoRoot,
    intent: retrieval.plan.intent,
    tools: retrieval.plan.selectedTools,
    seedTerms: retrieval.plan.seedTerms,
    workspaceCount: retrieval.workspaces.length,
    resultCount: retrieval.results.length,
    evidenceCount: retrieval.evidencePackets.length,
    evidencePreview: retrieval.evidencePackets.slice(0, 3).map((packet, index) => {
      return `evidence ${index + 1}: ${packet.filePath} [${packet.lines[0]}-${packet.lines[1]}] score=${packet.score.toFixed(2)} reason=${packet.reason}`;
    }),
    sessionId: resolved.session.sessionId,
    resumed: resolved.resumed,
    compaction: resolved.compaction,
    persistence: resolved.persistence,
    guidance,
  };
}
