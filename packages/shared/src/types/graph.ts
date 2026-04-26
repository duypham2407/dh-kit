export type GraphNode = {
  id: string;
  path: string;
  kind: string;
  language: string | null;
  contentHash: string | null;
  mtime: number;
  parseStatus: "pending" | "ok" | "error";
  updatedAt: string;
};

export type GraphEdgeType = "import" | "require" | "dynamic_import" | "re_export" | "type_import" | "side_effect_import";

export type GraphEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: GraphEdgeType;
  line: number;
};

export type GraphSymbol = {
  id: string;
  nodeId: string;
  name: string;
  kind: string;
  isExport: boolean;
  line: number;
  startLine: number | null;
  endLine: number | null;
  signature: string | null;
  docComment: string | null;
  scope: string | null;
};

export type GraphReferenceKind = "usage" | "type-reference";

export type GraphSymbolReference = {
  id: string;
  symbolId: string;
  nodeId: string;
  line: number;
  col: number;
  kind: GraphReferenceKind;
};

export type GraphCall = {
  id: string;
  callerSymbolId: string;
  calleeName: string;
  calleeNodeId: string | null;
  calleeSymbolId: string | null;
  line: number;
};

export type GraphIndexStats = {
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  filesDeleted: number;
  durationMs: number;
  importsResolved?: number;
  importsUnresolved?: number;
  importsExternal?: number;
  importsAmbiguous?: number;
  importsUnsafe?: number;
  importsDegraded?: number;
};
