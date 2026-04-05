import fs from "node:fs/promises";
import path from "node:path";
import type { EvidencePacket, NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";

export async function buildEvidencePackets(repoRoot: string, results: NormalizedRetrievalResult[]): Promise<EvidencePacket[]> {
  const packets = await Promise.all(results.map(async (result) => {
    const absolutePath = path.join(repoRoot, result.filePath);
    const snippet = await readSnippet(absolutePath);
    return {
      filePath: result.filePath,
      symbol: result.symbolName,
      lines: result.lineRange,
      reason: result.matchReason,
      score: result.normalizedScore,
      sourceTools: [result.sourceTool],
      snippet,
    } satisfies EvidencePacket;
  }));

  return packets.sort((left, right) => right.score - left.score);
}

async function readSnippet(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.slice(0, 500);
  } catch {
    return "Snippet unavailable.";
  }
}
