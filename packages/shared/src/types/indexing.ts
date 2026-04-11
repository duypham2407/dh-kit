export type IndexedWorkspace = {
  root: string;
  type: string;
  files: IndexedFile[];
  diagnostics?: WorkspaceScanDiagnostics;
  markers?: WorkspaceMarkers;
  scanMeta?: WorkspaceScanMeta;
};

export type IndexedFile = {
  id: string;
  path: string;
  extension: string;
  language: string;
  sizeBytes: number;
  status: "indexed" | "pending" | "ignored";
  ignoredReason?: string;
  workspaceRoot?: string;
};

export type WorkspaceMarkers = {
  hasPackageJson: boolean;
  hasGoMod: boolean;
};

export type ScanStopReason =
  | "none"
  | "max_files_reached"
  | "max_depth_reached"
  | "max_file_size_scan_stopped"
  | "io_error";

export type WorkspaceScanDiagnostics = {
  filesVisited: number;
  filesIndexed: number;
  filesIgnored: number;
  dirsSkipped: number;
  errors: number;
  stopReason: ScanStopReason;
};

export type WorkspaceScanMeta = {
  partial: boolean;
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
