import fs from "node:fs";
import path from "node:path";
import {
  canonicalizeAbsolutePath,
  isPathWithinWorkspace,
} from "../workspace/scan-paths.js";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

export type ModuleResolutionStatus = "resolved" | "unresolved" | "ambiguous" | "external" | "unsafe" | "degraded";
export type ModuleResolutionReason =
  | "relative_target_found"
  | "alias_target_found"
  | "alias_config_missing"
  | "alias_pattern_not_matched"
  | "target_missing"
  | "target_outside_workspace"
  | "multiple_targets"
  | "external_package"
  | "config_unreadable"
  | "config_parse_error"
  | "extends_unreadable"
  | "extends_parse_error"
  | "extends_outside_workspace"
  | "unsupported_config_shape";

export type ModuleResolutionResult = {
  specifier: string;
  containingFileAbsPath: string;
  status: ModuleResolutionStatus;
  reason: ModuleResolutionReason;
  resolvedAbsPath?: string;
  resolutionKind?: "relative" | "alias";
  configPath?: string;
};

type AliasConfig = {
  configPath: string;
  configDir: string;
  baseUrlAbs?: string;
  paths: Record<string, string[]>;
};

type AliasConfigResult = { config?: AliasConfig; diagnostic?: ModuleResolutionResult };

export function resolveModuleSpecifier(
  specifier: string,
  containingFileAbsPath: string,
  workspaceRootAbs?: string,
): string | null {
  const result = resolveModuleSpecifierDetailed(specifier, containingFileAbsPath, workspaceRootAbs);
  return result.status === "resolved" ? (result.resolvedAbsPath ?? null) : null;
}

export function resolveModuleSpecifierDetailed(
  specifier: string,
  containingFileAbsPath: string,
  workspaceRootAbs?: string,
): ModuleResolutionResult {
  if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return resolveBareSpecifier(specifier, containingFileAbsPath, workspaceRootAbs);
  }

  const base = canonicalizeAbsolutePath(path.resolve(path.dirname(containingFileAbsPath), specifier));
  const target = resolveLocalCandidate(base, workspaceRootAbs);
  if (target.status === "resolved") {
    return { specifier, containingFileAbsPath, status: "resolved", reason: "relative_target_found", resolvedAbsPath: target.path, resolutionKind: "relative" };
  }
  if (target.status === "unsafe") {
    return { specifier, containingFileAbsPath, status: "unsafe", reason: "target_outside_workspace" };
  }
  return { specifier, containingFileAbsPath, status: "unresolved", reason: "target_missing" };
}

function resolveBareSpecifier(
  specifier: string,
  containingFileAbsPath: string,
  workspaceRootAbs?: string,
): ModuleResolutionResult {
  const configResult = findAliasConfig(containingFileAbsPath, workspaceRootAbs);
  if (configResult.diagnostic) {
    return { ...configResult.diagnostic, specifier, containingFileAbsPath };
  }
  if (!configResult.config) {
    if (isAliasLike(specifier)) {
      return { specifier, containingFileAbsPath, status: "unresolved", reason: "alias_config_missing" };
    }
    return { specifier, containingFileAbsPath, status: "external", reason: "external_package" };
  }

  const config = configResult.config;
  const candidateBases: string[] = [];
  let unsupportedPattern = false;
  for (const [pattern, targets] of Object.entries(config.paths)) {
    const capture = matchAliasPattern(pattern, specifier);
    if (capture === null) continue;
    if ((pattern.match(/\*/g) ?? []).length > 1) {
      unsupportedPattern = true;
      continue;
    }
    for (const target of targets) {
      if ((target.match(/\*/g) ?? []).length > 1) {
        unsupportedPattern = true;
        continue;
      }
      const substituted = target.replace("*", capture);
      candidateBases.push(canonicalizeAbsolutePath(path.resolve(config.baseUrlAbs ?? config.configDir, substituted)));
    }
  }

  if (candidateBases.length === 0 && unsupportedPattern) {
    return { specifier, containingFileAbsPath, status: "degraded", reason: "unsupported_config_shape", configPath: config.configPath };
  }

  if (candidateBases.length === 0 && config.baseUrlAbs) {
    candidateBases.push(canonicalizeAbsolutePath(path.resolve(config.baseUrlAbs, specifier)));
  }

  if (candidateBases.length === 0) {
    return { specifier, containingFileAbsPath, status: isAliasLike(specifier) ? "unresolved" : "external", reason: isAliasLike(specifier) ? "alias_pattern_not_matched" : "external_package", configPath: config.configPath };
  }

  const resolved = new Set<string>();
  let sawUnsafe = false;
  for (const base of candidateBases) {
    const target = resolveLocalCandidate(base, workspaceRootAbs);
    if (target.status === "resolved" && target.path) resolved.add(target.path);
    if (target.status === "unsafe") sawUnsafe = true;
  }
  if (resolved.size > 1) {
    return { specifier, containingFileAbsPath, status: "ambiguous", reason: "multiple_targets", configPath: config.configPath };
  }
  const [only] = [...resolved];
  if (only) {
    return { specifier, containingFileAbsPath, status: "resolved", reason: "alias_target_found", resolvedAbsPath: only, resolutionKind: "alias", configPath: config.configPath };
  }
  if (sawUnsafe) {
    return { specifier, containingFileAbsPath, status: "unsafe", reason: "target_outside_workspace", configPath: config.configPath };
  }
  return { specifier, containingFileAbsPath, status: isPackageNameLike(specifier) ? "external" : "unresolved", reason: isPackageNameLike(specifier) ? "external_package" : "target_missing", configPath: config.configPath };
}

function resolveLocalCandidate(base: string, workspaceRootAbs?: string): { status: "resolved" | "unresolved" | "unsafe"; path?: string } {
  const candidates = [base, ...EXTENSIONS.map((ext) => `${base}${ext}`), ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`))];
  let sawExistingOutside = false;
  for (const candidateRaw of candidates) {
    const candidate = canonicalizeAbsolutePath(candidateRaw);
    const resolved = resolveExisting(candidate);
    if (!resolved) continue;
    if (isAllowed(resolved, workspaceRootAbs)) {
      return { status: "resolved", path: resolved };
    }
    sawExistingOutside = true;
  }
  return { status: sawExistingOutside ? "unsafe" : "unresolved" };
}

function findAliasConfig(containingFileAbsPath: string, workspaceRootAbs?: string): AliasConfigResult {
  const boundary = workspaceRootAbs ? canonicalizeAbsolutePath(workspaceRootAbs) : undefined;
  let dir = path.dirname(containingFileAbsPath);
  while (true) {
    const tsconfig = path.join(dir, "tsconfig.json");
    const jsconfig = path.join(dir, "jsconfig.json");
    const configPath = fs.existsSync(tsconfig) ? tsconfig : (fs.existsSync(jsconfig) ? jsconfig : null);
    if (configPath) return loadAliasConfig(configPath, boundary, new Set(), 0);
    if (boundary && canonicalizeAbsolutePath(dir) === boundary) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    if (boundary && !isPathWithinWorkspace(boundary, parent)) break;
    dir = parent;
  }
  return {};
}

function loadAliasConfig(configPath: string, boundary: string | undefined, seen: Set<string>, depth: number): AliasConfigResult {
  const canonical = canonicalizeAbsolutePath(configPath);
  if (boundary && !isPathWithinWorkspace(boundary, canonical)) {
    return { diagnostic: { specifier: "", containingFileAbsPath: "", status: "degraded", reason: "extends_outside_workspace", configPath: canonical } };
  }
  if (seen.has(canonical) || depth > 8) {
    return { diagnostic: { specifier: "", containingFileAbsPath: "", status: "degraded", reason: "unsupported_config_shape", configPath: canonical } };
  }
  seen.add(canonical);
  let raw: string;
  try {
    raw = fs.readFileSync(canonical, "utf8");
  } catch {
    return { diagnostic: { specifier: "", containingFileAbsPath: "", status: "degraded", reason: depth === 0 ? "config_unreadable" : "extends_unreadable", configPath: canonical } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw));
  } catch {
    return { diagnostic: { specifier: "", containingFileAbsPath: "", status: "degraded", reason: depth === 0 ? "config_parse_error" : "extends_parse_error", configPath: canonical } };
  }
  if (!isRecord(parsed)) {
    return { diagnostic: { specifier: "", containingFileAbsPath: "", status: "degraded", reason: "unsupported_config_shape", configPath: canonical } };
  }
  let parent: AliasConfig | undefined;
  const ext = typeof parsed.extends === "string" ? parsed.extends : undefined;
  if (ext) {
    if (!ext.startsWith(".")) return { diagnostic: { specifier: "", containingFileAbsPath: "", status: "degraded", reason: "unsupported_config_shape", configPath: canonical } };
    const extPath = ext.endsWith(".json") ? ext : `${ext}.json`;
    const parentResult = loadAliasConfig(path.resolve(path.dirname(canonical), extPath), boundary, seen, depth + 1);
    if (parentResult.diagnostic) return parentResult;
    parent = parentResult.config;
  }
  const compilerOptions = isRecord(parsed.compilerOptions) ? parsed.compilerOptions : {};
  const baseUrl = typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : undefined;
  const paths = parsePaths(compilerOptions.paths);
  return {
    config: {
      configPath: canonical,
      configDir: path.dirname(canonical),
      baseUrlAbs: baseUrl ? canonicalizeAbsolutePath(path.resolve(path.dirname(canonical), baseUrl)) : parent?.baseUrlAbs,
      paths: { ...(parent?.paths ?? {}), ...paths },
    },
  };
}

function parsePaths(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  const paths: Record<string, string[]> = {};
  for (const [key, rawTargets] of Object.entries(value)) {
    if (Array.isArray(rawTargets) && rawTargets.every((target) => typeof target === "string")) {
      paths[key] = rawTargets;
    }
  }
  return paths;
}

function matchAliasPattern(pattern: string, specifier: string): string | null {
  const wildcardCount = (pattern.match(/\*/g) ?? []).length;
  if (wildcardCount === 0) return pattern === specifier ? "" : null;
  if (wildcardCount > 1) return pattern.replace(/\*/g, "") && specifier ? "" : null;
  const [prefix = "", suffix = ""] = pattern.split("*");
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

function isAliasLike(specifier: string): boolean {
  return specifier.startsWith("@/") || specifier.startsWith("~/") || specifier.startsWith("#") || specifier.startsWith("@");
}

function isPackageNameLike(specifier: string): boolean {
  return !specifier.includes("/") || /^@[^/]+\/[^/]+$/.test(specifier);
}

function stripJsonCommentsAndTrailingCommas(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
