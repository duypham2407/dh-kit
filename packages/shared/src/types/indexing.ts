export type IndexedWorkspace = {
  root: string;
  type: string;
  files: IndexedFile[];
};

export type IndexedFile = {
  id: string;
  path: string;
  extension: string;
  language: string;
  sizeBytes: number;
  status: "indexed" | "pending" | "ignored";
};

export type IndexedSymbol = {
  id: string;
  fileId: string;
  name: string;
  kind: "function" | "class" | "method" | "interface" | "type" | "const" | "namespace" | "unknown";
  lineStart: number;
  lineEnd: number;
};

export type IndexedChunk = {
  id: string;
  fileId: string;
  symbolId?: string;
  lineStart: number;
  lineEnd: number;
  content: string;
};

export type IndexedEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: "import" | "export" | "call" | "reference" | "containment";
};
