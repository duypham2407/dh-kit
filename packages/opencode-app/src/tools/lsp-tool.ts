import type { LspDiagnosticsReport, LspHoverReport } from "../lsp/lsp-client.js";
import { LspService } from "../lsp/lsp-service.js";

export type LspToolResult<TOutput> = {
  toolName: "lsp_diagnostics" | "lsp_hover";
  status: "succeeded" | "unsupported" | "failed";
  output?: TOutput;
  error?: string;
  metadata: { truncated: false };
};

export async function executeLspDiagnosticsTool(input: {
  service: LspService;
  input: { path: string };
}): Promise<LspToolResult<LspDiagnosticsReport>> {
  try {
    const report = await input.service.diagnostics(input.input.path);
    return {
      toolName: "lsp_diagnostics",
      status: report.available ? "succeeded" : "unsupported",
      output: report,
      error: report.available ? undefined : report.reason,
      metadata: { truncated: false },
    };
  } catch (error) {
    return {
      toolName: "lsp_diagnostics",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: { truncated: false },
    };
  }
}

export async function executeLspHoverTool(input: {
  service: LspService;
  input: { path: string; line: number; character: number };
}): Promise<LspToolResult<LspHoverReport>> {
  try {
    const report = await input.service.hover(input.input.path, input.input.line, input.input.character);
    return {
      toolName: "lsp_hover",
      status: report.available ? "succeeded" : "unsupported",
      output: report,
      error: report.available ? undefined : report.reason,
      metadata: { truncated: false },
    };
  } catch (error) {
    return {
      toolName: "lsp_hover",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: { truncated: false },
    };
  }
}
