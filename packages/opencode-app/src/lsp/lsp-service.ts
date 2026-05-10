import type { LspClient, LspDiagnosticsReport, LspEnablement } from "./lsp-client.js";
import { findLspServerForFile } from "./lsp-server-catalog.js";
import { resolveRepoPath } from "../tools/tool-paths.js";

export type LspServiceOptions = {
  repoRoot: string;
  enablement?: LspEnablement;
  client?: LspClient;
};

export class LspService {
  constructor(private readonly options: LspServiceOptions) {}

  async diagnostics(filePath: string): Promise<LspDiagnosticsReport> {
    const resolved = resolveRepoPath(this.options.repoRoot, filePath);
    const server = findLspServerForFile(resolved.relativePath);
    if (!server) {
      return {
        available: false,
        file: resolved.relativePath,
        reason: "No LSP server is registered for this file type.",
        diagnostics: [],
      };
    }
    if ((this.options.enablement ?? "off") === "off") {
      return {
        available: false,
        file: resolved.relativePath,
        serverId: server.id,
        language: server.languages[0],
        reason: "LSP is disabled.",
        diagnostics: [],
      };
    }
    if (!this.options.client) {
      return {
        available: false,
        file: resolved.relativePath,
        serverId: server.id,
        language: server.languages[0],
        reason: "LSP client is not configured.",
        diagnostics: [],
      };
    }

    const diagnostics = await this.options.client.diagnostics(resolved.relativePath);
    return {
      available: true,
      file: resolved.relativePath,
      serverId: server.id,
      language: server.languages[0],
      diagnostics: diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: diagnostic.path,
      })),
    };
  }
}
