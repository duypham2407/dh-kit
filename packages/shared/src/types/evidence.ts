export type EvidencePacket = {
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
  filePath: string;
  symbolName?: string;
  lineRange: [number, number];
  sourceTool: string;
  matchReason: string;
  rawScore: number;
  normalizedScore: number;
  metadata: Record<string, unknown>;
};
