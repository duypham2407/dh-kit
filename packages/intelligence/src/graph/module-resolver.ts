import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeAbsolutePath,
  isPathWithinWorkspace,
} from "../workspace/scan-paths.js";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

export function resolveModuleSpecifier(
  specifier: string,
  containingFileAbsPath: string,
  workspaceRootAbs?: string,
): string | null {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return null;
  }

  const base = canonicalizeAbsolutePath(path.resolve(path.dirname(containingFileAbsPath), specifier));
  const direct = resolveExisting(base);
  if (direct && isAllowed(direct, workspaceRootAbs)) {
    return direct;
  }

  for (const ext of EXTENSIONS) {
    const candidate = canonicalizeAbsolutePath(`${base}${ext}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      if (isAllowed(candidate, workspaceRootAbs)) {
        return candidate;
      }
    }
  }

  for (const ext of EXTENSIONS) {
    const indexCandidate = canonicalizeAbsolutePath(path.join(base, `index${ext}`));
    if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
      if (isAllowed(indexCandidate, workspaceRootAbs)) {
        return indexCandidate;
      }
    }
  }

  return null;
}

function resolveExisting(absPath: string): string | null {
  if (!fs.existsSync(absPath)) {
    return null;
  }
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    return canonicalizeAbsolutePath(absPath);
  }
  return null;
}

function isAllowed(absPath: string, workspaceRootAbs?: string): boolean {
  if (!workspaceRootAbs) {
    return true;
  }
  return isPathWithinWorkspace(workspaceRootAbs, absPath);
}
