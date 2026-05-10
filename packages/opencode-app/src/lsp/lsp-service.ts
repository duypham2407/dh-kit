import type { LspClient, LspDiagnosticsReport, LspEnablement, LspHoverReport } from "./lsp-client.js";
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
    const { file, server, unavailable } = this.resolve(filePath);
    if (unavailable) return { ...unavailable, diagnostics: [] };
    const diagnostics = await this.options.client!.diagnostics(file);
    return {
      available: true,
      file,
      serverId: server.id,
      language: server.languages[0],
      diagnostics: diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: diagnostic.path,
      })),
    };
  }

  async hover(filePath: string, line: number, character: number): Promise<LspHoverReport> {
    const { file, server, unavailable } = this.resolve(filePath);
    if (unavailable) return unavailable;
    if (!this.options.client?.hover) {
      return {
        available: false,
        file,
        serverId: server.id,
        language: server.languages[0],
        reason: "LSP hover is not supported by the configured client.",
      };
    }
    const contents = await this.options.client.hover(file, line, character);
    return {
      available: contents !== undefined,
      file,
      serverId: server.id,
      language: server.languages[0],
      contents,
      reason: contents === undefined ? "No hover information available." : undefined,
    };
  }

  private resolve(filePath: string): {
    file: string;
    server: NonNullable<ReturnType<typeof findLspServerForFile>>;
    unavailable?: Omit<LspDiagnosticsReport, "diagnostics">;
  } {
    const resolved = resolveRepoPath(this.options.repoRoot, filePath);
    const server = findLspServerForFile(resolved.relativePath);
    if (!server) {
      return {
        file: resolved.relativePath,
        server: undefined as never,
        unavailable: {
          available: false,
          file: resolved.relativePath,
          reason: "No LSP server is registered for this file type.",
        },
      };
    }
    if ((this.options.enablement ?? "off") === "off") {
      return {
        file: resolved.relativePath,
        server,
        unavailable: {
          available: false,
          file: resolved.relativePath,
          serverId: server.id,
          language: server.languages[0],
          reason: "LSP is disabled.",
        },
      };
    }
    if (!this.options.client) {
      return {
        file: resolved.relativePath,
        server,
        unavailable: {
          available: false,
          file: resolved.relativePath,
          serverId: server.id,
          language: server.languages[0],
          reason: "LSP client is not configured.",
        },
      };
    }
    return { file: resolved.relativePath, server };
  }
}
