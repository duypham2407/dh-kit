import path from "node:path";

export type LspServerCatalogEntry = {
  id: string;
  name: string;
  command: string;
  args: string[];
  languages: string[];
  extensions: string[];
  mode: "manual";
};

const LSP_SERVERS: LspServerCatalogEntry[] = [
  {
    id: "typescript-language-server",
    name: "TypeScript Language Server",
    command: "typescript-language-server",
    args: ["--stdio"],
    languages: ["typescript", "javascript"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"],
    mode: "manual",
  },
];

export function listLspServers(): LspServerCatalogEntry[] {
  return LSP_SERVERS.map((server) => ({
    ...server,
    args: [...server.args],
    languages: [...server.languages],
    extensions: [...server.extensions],
  }));
}

export function findLspServerForFile(filePath: string): LspServerCatalogEntry | undefined {
  const ext = path.extname(filePath);
  const server = LSP_SERVERS.find((entry) => entry.extensions.includes(ext));
  return server ? {
    ...server,
    args: [...server.args],
    languages: [...server.languages],
    extensions: [...server.extensions],
  } : undefined;
}
