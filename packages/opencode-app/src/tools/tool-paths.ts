import path from "node:path";

export type ResolvedRepoPath = {
  absolutePath: string;
  relativePath: string;
};

export function resolveRepoPath(repoRoot: string, requestedPath: string): ResolvedRepoPath {
  const absolutePath = path.resolve(repoRoot, requestedPath);
  const relative = path.relative(repoRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path '${requestedPath}' is outside the repository.`);
  }
  return {
    absolutePath,
    relativePath: normalizeRelativePath(relative || "."),
  };
}

export function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}
