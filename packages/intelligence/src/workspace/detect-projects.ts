import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  canonicalizeAbsolutePath,
  isSameOrParentPath,
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
  const candidateRoots = await discoverWorkspaceRootsByMarkers(workspaceRoot, scanOptions);
  const workspaceRoots = finalizeWorkspaceRoots(workspaceRoot, candidateRoots);

  if (workspaceRoots.length === 0) {
    return [await buildWorkspace(workspaceRoot, scanOptions)];
  }

  return Promise.all(workspaceRoots.map((root) => buildWorkspace(root, scanOptions)));
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
        id: stableFileId(root, relativePath),
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
  const [hasPackageJson, hasCargoToml] = await Promise.all([
    markerExists(path.join(root, "package.json")),
    markerExists(path.join(root, "Cargo.toml")),
  ]);
  return { hasPackageJson, hasCargoToml };
}

async function buildWorkspace(workspaceRoot: string, options: Required<ScanOptions>): Promise<IndexedWorkspace> {
  const markers = await detectWorkspaceMarkers(workspaceRoot);
  const scan = await collectFiles(workspaceRoot, workspaceRoot, options);
  return {
    root: workspaceRoot,
    type: detectWorkspaceType(markers),
    files: scan.files,
    diagnostics: scan.diagnostics,
    markers,
    scanMeta: { partial: scan.diagnostics.stopReason !== "none" },
  };
}

async function discoverWorkspaceRootsByMarkers(repoRoot: string, options: Required<ScanOptions>): Promise<string[]> {
  const ignoreDirs = new Set(options.ignoreDirs);
  const discovered = new Set<string>();

  async function walk(scanPath: string, depth = 0): Promise<void> {
    if (depth > options.maxDepth) {
      return;
    }

    if (!isPathWithinWorkspace(repoRoot, scanPath)) {
      return;
    }

    const markers = await detectWorkspaceMarkers(scanPath);
    if (markers.hasCargoToml || markers.hasPackageJson) {
      discovered.add(canonicalizeAbsolutePath(scanPath));
    }

    let entries;
    try {
      entries = await fs.readdir(scanPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink() && !options.followSymlinks) {
        continue;
      }
      if (!entry.isDirectory()) {
        continue;
      }
      const entryName = String(entry.name);
      if (ignoreDirs.has(entryName)) {
        continue;
      }

      const absolutePath = path.join(scanPath, entryName);
      if (!isPathWithinWorkspace(repoRoot, absolutePath)) {
        continue;
      }
      await walk(absolutePath, depth + 1);
    }
  }

  await walk(repoRoot, 0);
  return [...discovered];
}

function finalizeWorkspaceRoots(repoRoot: string, roots: string[]): string[] {
  const canonicalRepoRoot = canonicalizeAbsolutePath(repoRoot);
  const inRepo = roots
    .map((root) => canonicalizeAbsolutePath(root))
    .filter((root) => isPathWithinWorkspace(canonicalRepoRoot, root));

  const deduped = [...new Set(inRepo)].sort((left, right) => left.localeCompare(right));
  const leafRoots = deduped.filter((candidate, _, all) => {
    return !all.some((other) => other !== candidate && isSameOrParentPath(candidate, other));
  });

  return leafRoots.sort((left, right) => left.localeCompare(right));
}

function detectWorkspaceType(markers: WorkspaceMarkers): string {
  if (markers.hasPackageJson) {
    return "node";
  }
  if (markers.hasCargoToml) {
    return "rust";
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

function stableFileId(workspaceRoot: string, relativePath: string): string {
  const identity = `${workspaceRoot}::${relativePath}`;
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 12);
  return `file-${hash}`;
}
