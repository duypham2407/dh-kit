export type EvidencePacket = {
  /** Canonical repo-relative file path for deterministic repoRoot resolution. */
  filePath: string;
  symbol?: string;
  lines: [number, number];
  reason: string;
  score: number;
  sourceTools: string[];
  snippet: string;
};

export type NormalizedRetrievalResult = {
  entityType: "file" | "symbol" | "chunk";
  entityId: string;
  /** Canonical repo-relative file path across semantic/non-semantic retrieval. */
  filePath: string;
  symbolName?: string;
  lineRange: [number, number];
  sourceTool: string;
  matchReason: string;
  rawScore: number;
  normalizedScore: number;
  metadata: Record<string, unknown>;
};
