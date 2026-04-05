import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createId } from "../../../shared/src/utils/ids.js";
import type { IndexedFile, IndexedWorkspace } from "../../../shared/src/types/indexing.js";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".dh", "dist"]);
const INDEXABLE_EXTENSIONS = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".json", "json"],
  [".md", "markdown"],
  [".go", "go"],
]);

export async function detectProjects(repoRoot: string): Promise<IndexedWorkspace[]> {
  const files = await collectFiles(repoRoot, repoRoot);
  return [{ root: repoRoot, type: detectWorkspaceType(files), files }];
}

async function collectFiles(root: string, currentPath: string): Promise<IndexedFile[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const files: IndexedFile[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...await collectFiles(root, absolutePath));
      continue;
    }

    const extension = path.extname(entry.name);
    const language = INDEXABLE_EXTENSIONS.get(extension);
    if (!language) {
      continue;
    }

    const stat = await fs.stat(absolutePath);
    const relativePath = path.relative(root, absolutePath);
    files.push({
      id: stableFileId(relativePath),
      path: relativePath,
      extension,
      language,
      sizeBytes: stat.size,
      status: "indexed",
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function detectWorkspaceType(files: IndexedFile[]): string {
  if (files.some((file) => file.path.endsWith("package.json"))) {
    return "node";
  }
  if (files.some((file) => file.path.endsWith("go.mod"))) {
    return "go";
  }
  return "unknown";
}

function stableFileId(relativePath: string): string {
  const hash = createHash("sha256").update(relativePath).digest("hex").slice(0, 12);
  return `file-${hash}`;
}
