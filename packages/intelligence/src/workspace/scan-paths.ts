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
