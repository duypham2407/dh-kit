import fs from "node:fs/promises";
import path from "node:path";
import type { IndexedEdge, IndexedFile } from "../../../shared/src/types/indexing.js";
import { createId } from "../../../shared/src/utils/ids.js";

const IMPORT_REGEX = /^\s*import\s+.*?from\s+["'](.+?)["'];?/gm;

export async function extractImportEdges(repoRoot: string, files: IndexedFile[]): Promise<IndexedEdge[]> {
  const edges: IndexedEdge[] = [];
  for (const file of files.filter((entry) => ["typescript", "tsx", "javascript", "jsx"].includes(entry.language))) {
    const absolutePath = path.join(repoRoot, file.path);
    const content = await fs.readFile(absolutePath, "utf8");
    for (const match of content.matchAll(IMPORT_REGEX)) {
      edges.push({
        id: createId("edge"),
        fromId: file.id,
        toId: match[1],
        kind: "import",
      });
    }
  }
  return edges;
}
