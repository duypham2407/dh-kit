import path from "node:path";

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
