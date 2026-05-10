export type LspEnablement = "off" | "manual" | "auto";

export type LspDiagnosticSeverity = "error" | "warning" | "information" | "hint";

export type LspRange = {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
};

export type LspDiagnostic = {
  path: string;
  severity: LspDiagnosticSeverity;
  message: string;
  range: LspRange;
  source?: string;
};

export type LspLocation = {
  path: string;
  range: LspRange;
};

export type LspSymbol = {
  name: string;
  kind: string;
  path?: string;
  range?: LspRange;
};

export type LspClient = {
  diagnostics(filePath: string): Promise<LspDiagnostic[]>;
  hover?(filePath: string, line: number, character: number): Promise<string | undefined>;
  definition?(filePath: string, line: number, character: number): Promise<LspLocation[]>;
  references?(filePath: string, line: number, character: number): Promise<LspLocation[]>;
  documentSymbols?(filePath: string): Promise<LspSymbol[]>;
  workspaceSymbols?(query: string): Promise<LspSymbol[]>;
};

export type LspDiagnosticsReport = {
  available: boolean;
  file: string;
  serverId?: string;
  language?: string;
  reason?: string;
  diagnostics: LspDiagnostic[];
};
