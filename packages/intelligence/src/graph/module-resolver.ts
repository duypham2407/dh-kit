import fs from "node:fs";
import path from "node:path";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

export function resolveModuleSpecifier(specifier: string, containingFileAbsPath: string): string | null {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return null;
  }

  const base = path.resolve(path.dirname(containingFileAbsPath), specifier);
  const direct = resolveExisting(base);
  if (direct) {
    return direct;
  }

  for (const ext of EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  for (const ext of EXTENSIONS) {
    const indexCandidate = path.join(base, `index${ext}`);
    if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
      return indexCandidate;
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
    return absPath;
  }
  return null;
}
