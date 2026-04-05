import { runRetrieval } from "../../../retrieval/src/query/run-retrieval.js";

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
  message?: string;
};

export async function runKnowledgeCommand(input: {
  kind: "ask" | "explain" | "trace";
  input: string;
  repoRoot: string;
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
    };
  }

  const retrieval = await runRetrieval({
    repoRoot: input.repoRoot,
    query: input.input,
    mode: input.kind,
    semanticMode: "always",
  });

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
  };
}
