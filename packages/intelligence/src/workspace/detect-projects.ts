import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  canonicalizeAbsolutePath,
  isPathWithinWorkspace,
  toWorkspaceRelativePath,
} from "./scan-paths.js";
import type {
  IndexedFile,
  IndexedWorkspace,
  WorkspaceMarkers,
  WorkspaceScanDiagnostics,
} from "../../../shared/src/types/indexing.js";

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

const DEFAULT_SCAN_OPTIONS: Required<ScanOptions> = {
  maxFiles: 10_000,
  maxDepth: 32,
  maxFileSizeBytes: 1_048_576,
  followSymlinks: false,
  includeExtensions: [...INDEXABLE_EXTENSIONS.keys()],
  ignoreDirs: [...IGNORED_DIRECTORIES],
};

export type ScanOptions = {
  maxFiles?: number;
  maxDepth?: number;
  maxFileSizeBytes?: number;
  followSymlinks?: boolean;
  includeExtensions?: string[];
  ignoreDirs?: string[];
};

export async function detectProjects(repoRoot: string, options?: ScanOptions): Promise<IndexedWorkspace[]> {
  const workspaceRoot = canonicalizeAbsolutePath(repoRoot);
  const scanOptions = resolveOptions(options);
  const markers = await detectWorkspaceMarkers(workspaceRoot);
  const scan = await collectFiles(workspaceRoot, workspaceRoot, scanOptions);

  return [{
    root: workspaceRoot,
    type: detectWorkspaceType(markers),
    files: scan.files,
    diagnostics: scan.diagnostics,
    markers,
    scanMeta: { partial: scan.diagnostics.stopReason !== "none" },
  }];
}

async function collectFiles(root: string, currentPath: string, options: Required<ScanOptions>, depth = 0): Promise<{
  files: IndexedFile[];
  diagnostics: WorkspaceScanDiagnostics;
}> {
  const diagnostics: WorkspaceScanDiagnostics = {
    filesVisited: 0,
    filesIndexed: 0,
    filesIgnored: 0,
    dirsSkipped: 0,
    errors: 0,
    stopReason: "none",
  };
  const files: IndexedFile[] = [];
  const ignoreDirs = new Set(options.ignoreDirs);
  const includeExtensions = new Map(options.includeExtensions.map((ext) => [ext, INDEXABLE_EXTENSIONS.get(ext)]));

  async function walk(scanPath: string, scanDepth: number): Promise<void> {
    if (diagnostics.stopReason !== "none") {
      return;
    }

    if (scanDepth > options.maxDepth) {
      diagnostics.stopReason = "max_depth_reached";
      diagnostics.dirsSkipped += 1;
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(scanPath, { withFileTypes: true });
    } catch {
      diagnostics.errors += 1;
      if (diagnostics.stopReason === "none") {
        diagnostics.stopReason = "io_error";
      }
      return;
    }

    for (const entry of entries) {
      if (diagnostics.stopReason !== "none") {
        return;
      }

      const entryName = String(entry.name);
      const absolutePath = path.join(scanPath, entryName);

      if (entry.isSymbolicLink()) {
        if (!options.followSymlinks) {
          diagnostics.dirsSkipped += 1;
          continue;
        }
      }

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entryName)) {
          diagnostics.dirsSkipped += 1;
          continue;
        }

        if (!isPathWithinWorkspace(root, absolutePath)) {
          diagnostics.dirsSkipped += 1;
          continue;
        }

        await walk(absolutePath, scanDepth + 1);
        continue;
      }

      diagnostics.filesVisited += 1;

      const extension = path.extname(entryName);
      const language = includeExtensions.get(extension);
      if (!language) {
        diagnostics.filesIgnored += 1;
        continue;
      }

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        diagnostics.errors += 1;
        continue;
      }

      if (stat.size > options.maxFileSizeBytes) {
        diagnostics.filesIgnored += 1;
        diagnostics.stopReason = "max_file_size_scan_stopped";
        continue;
      }

      const relativePath = toWorkspaceRelativePath(root, absolutePath);
      if (!relativePath) {
        diagnostics.filesIgnored += 1;
        continue;
      }

      files.push({
        id: stableFileId(relativePath),
        path: relativePath,
        extension,
        language,
        sizeBytes: stat.size,
        status: "indexed",
        workspaceRoot: root,
      });
      diagnostics.filesIndexed += 1;

      if (files.length >= options.maxFiles) {
        diagnostics.stopReason = "max_files_reached";
        return;
      }
    }
  }

  await walk(currentPath, depth);

  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    diagnostics,
  };
}

function resolveOptions(options?: ScanOptions): Required<ScanOptions> {
  return {
    ...DEFAULT_SCAN_OPTIONS,
    ...options,
    includeExtensions: options?.includeExtensions ?? DEFAULT_SCAN_OPTIONS.includeExtensions,
    ignoreDirs: options?.ignoreDirs ?? DEFAULT_SCAN_OPTIONS.ignoreDirs,
  };
}

async function detectWorkspaceMarkers(root: string): Promise<WorkspaceMarkers> {
  const [hasPackageJson, hasGoMod] = await Promise.all([
    markerExists(path.join(root, "package.json")),
    markerExists(path.join(root, "go.mod")),
  ]);
  return { hasPackageJson, hasGoMod };
}

function detectWorkspaceType(markers: WorkspaceMarkers): string {
  if (markers.hasPackageJson) {
    return "node";
  }
  if (markers.hasGoMod) {
    return "go";
  }
  return "unknown";
}

async function markerExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function stableFileId(relativePath: string): string {
  const hash = createHash("sha256").update(relativePath).digest("hex").slice(0, 12);
  return `file-${hash}`;
}
