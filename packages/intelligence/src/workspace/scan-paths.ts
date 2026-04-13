import path from "node:path";
import type { IndexedFile } from "../../../shared/src/types/indexing.js";

export function normalizePathSlashes(input: string): string {
  return input.replace(/\\/g, "/");
}

export function canonicalizeAbsolutePath(input: string): string {
  return normalizePathSlashes(path.resolve(input));
}

export function toWorkspaceRelativePath(workspaceRootAbs: string, targetAbs: string): string | null {
  const root = canonicalizeAbsolutePath(workspaceRootAbs);
  const target = canonicalizeAbsolutePath(targetAbs);
  const relative = normalizePathSlashes(path.relative(root, target));
  if (!relative || relative === ".") {
    return null;
  }
  if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

export function isPathWithinWorkspace(workspaceRootAbs: string, targetAbs: string): boolean {
  const root = canonicalizeAbsolutePath(workspaceRootAbs);
  const target = canonicalizeAbsolutePath(targetAbs);
  const relative = normalizePathSlashes(path.relative(root, target));
  if (relative === "") {
    return true;
  }
  if (relative === ".") {
    return true;
  }
  if (relative.startsWith("../") || relative === "..") {
    return false;
  }
  return !path.isAbsolute(relative);
}

export function isSameOrParentPath(parentCandidateAbs: string, childCandidateAbs: string): boolean {
  const parent = canonicalizeAbsolutePath(parentCandidateAbs);
  const child = canonicalizeAbsolutePath(childCandidateAbs);
  const relative = normalizePathSlashes(path.relative(parent, child));
  if (relative === "" || relative === ".") {
    return true;
  }
  if (relative.startsWith("../") || relative === "..") {
    return false;
  }
  return !path.isAbsolute(relative);
}

export function resolveIndexedFileAbsolutePath(repoRootAbs: string, file: IndexedFile): string | null {
  const workspaceRoot = file.workspaceRoot ? canonicalizeAbsolutePath(file.workspaceRoot) : canonicalizeAbsolutePath(repoRootAbs);
  const absolutePath = canonicalizeAbsolutePath(path.join(workspaceRoot, file.path));
  if (!isPathWithinWorkspace(workspaceRoot, absolutePath)) {
    return null;
  }
  return absolutePath;
}

export function toRepoRelativePath(repoRootAbs: string, absolutePath: string): string | null {
  const repoRoot = canonicalizeAbsolutePath(repoRootAbs);
  const target = canonicalizeAbsolutePath(absolutePath);
  if (!isPathWithinWorkspace(repoRoot, target)) {
    return null;
  }
  const relative = normalizePathSlashes(path.relative(repoRoot, target));
  if (!relative || relative === ".") {
    return null;
  }
  if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative)) {
    return null;
  }
  return relative;
}

/**
 * Normalize a candidate path to canonical repo-relative form.
 *
 * Supported inputs:
 * - already repo-relative paths
 * - absolute paths inside repoRoot
 *
 * Rejected inputs:
 * - empty paths
 * - absolute paths outside repoRoot
 * - relative paths that escape repoRoot ("..")
 */
export function normalizeToRepoRelativePath(repoRootAbs: string, candidatePath: string): string | null {
  const trimmed = candidatePath.trim();
  if (!trimmed) {
    return null;
  }

  if (path.isAbsolute(trimmed)) {
    return toRepoRelativePath(repoRootAbs, trimmed);
  }

  const slashNormalized = normalizePathSlashes(trimmed).replace(/^\.\//, "");
  const posixNormalized = path.posix.normalize(slashNormalized);
  if (!posixNormalized || posixNormalized === ".") {
    return null;
  }
  if (posixNormalized.startsWith("../") || posixNormalized === ".." || path.isAbsolute(posixNormalized)) {
    return null;
  }

  const absolute = canonicalizeAbsolutePath(path.join(repoRootAbs, posixNormalized));
  if (!isPathWithinWorkspace(repoRootAbs, absolute)) {
    return null;
  }

  return toRepoRelativePath(repoRootAbs, absolute);
}
