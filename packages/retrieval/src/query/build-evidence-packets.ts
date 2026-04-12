import fs from "node:fs/promises";
import path from "node:path";
import type { EvidencePacket, NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { normalizeToRepoRelativePath } from "../../../intelligence/src/workspace/scan-paths.js";
import { recordTelemetry } from "../semantic/telemetry-collector.js";

export async function buildEvidencePackets(repoRoot: string, results: NormalizedRetrievalResult[]): Promise<EvidencePacket[]> {
  const packets = await Promise.all(results.map(async (result) => {
    // Safety net only: retrieval should already provide canonical repo-relative
    // paths. We still normalize/validate here so legacy malformed inputs are
    // observable rather than silently trusted.
    const normalizedPath = normalizeToRepoRelativePath(repoRoot, result.filePath);
    const absolutePath = normalizedPath ? path.join(repoRoot, normalizedPath) : null;
    const snippetResult = await readSnippet(absolutePath);
    if (!normalizedPath || snippetResult.failureKind !== "none") {
      const failureKind = !normalizedPath
        ? "normalization_failed"
        : "file_read_failed";
      recordTelemetry(repoRoot, {
        kind: "evidence_path_unresolved",
        details: {
          filePath: result.filePath,
          normalizedFilePath: normalizedPath,
          sourceTool: result.sourceTool,
          failureKind,
        },
      });
    }
    return {
      filePath: normalizedPath ?? result.filePath,
      symbol: result.symbolName,
      lines: result.lineRange,
      reason: result.matchReason,
      score: result.normalizedScore,
      sourceTools: [result.sourceTool],
      snippet: snippetResult.snippet,
    } satisfies EvidencePacket;
  }));

  return packets.sort((left, right) => right.score - left.score);
}

async function readSnippet(filePath: string | null): Promise<{
  snippet: string;
  failureKind: "none" | "file_read_failed";
}> {
  if (!filePath) {
    return { snippet: "Snippet unavailable.", failureKind: "file_read_failed" };
  }
  try {
    const content = await fs.readFile(filePath, "utf8");
    return { snippet: content.slice(0, 500), failureKind: "none" };
  } catch {
    return { snippet: "Snippet unavailable.", failureKind: "file_read_failed" };
  }
}
