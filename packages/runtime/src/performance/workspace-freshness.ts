import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type WorkspaceFingerprint = {
  fingerprint: string;
  files: string[];
  generatedAt: string;
};

export type WorkspaceFreshnessReport = {
  status: "first_run" | "fresh" | "changed";
  workspaceFingerprint: string;
  previousFingerprint?: string;
  indexedFiles: number;
  changedFiles: string[];
  checkedAt: string;
};

const IGNORED_DIRS = new Set([".git", ".dh", "dist", "node_modules"]);

export function computeWorkspaceFingerprint(repoRoot: string): WorkspaceFingerprint {
  const files = listFiles(repoRoot);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const absolute = path.join(repoRoot, file);
    const stat = fs.statSync(absolute);
    hash.update(`${file}:${stat.size}:${Math.floor(stat.mtimeMs)}\n`);
  }
  return {
    fingerprint: hash.digest("hex"),
    files,
    generatedAt: new Date().toISOString(),
  };
}

export function checkWorkspaceFreshness(input: { repoRoot: string; update?: boolean }): WorkspaceFreshnessReport {
  const current = computeWorkspaceFingerprint(input.repoRoot);
  const prior = readPrior(input.repoRoot);
  const status = !prior ? "first_run" : prior.fingerprint === current.fingerprint ? "fresh" : "changed";
  const report: WorkspaceFreshnessReport = {
    status,
    workspaceFingerprint: current.fingerprint,
    previousFingerprint: prior?.fingerprint,
    indexedFiles: current.files.length,
    changedFiles: status === "changed" && prior ? changedFiles(input.repoRoot, prior, current.files) : [],
    checkedAt: current.generatedAt,
  };
  if (input.update) writePrior(input.repoRoot, current);
  return report;
}

function changedFiles(repoRoot: string, prior: StoredFingerprint, currentFiles: string[]): string[] {
  const previous = new Set(prior.files);
  return currentFiles.filter((file) => {
    if (!previous.has(file)) return true;
    const before = prior.fileFingerprints[file];
    const after = fileFingerprint(repoRoot, file);
    return before !== after;
  }).slice(0, 50);
}

function fileFingerprint(repoRoot: string, file: string): string {
  const absolute = path.join(repoRoot, file);
  const stat = fs.statSync(absolute);
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
}

function listFiles(repoRoot: string): string[] {
  const files: string[] = [];
  walk(repoRoot, repoRoot, files);
  return files.sort();
}

function walk(repoRoot: string, current: string, files: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(repoRoot, path.join(current, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    files.push(path.relative(repoRoot, path.join(current, entry.name)));
  }
}

type StoredFingerprint = WorkspaceFingerprint & {
  fileFingerprints: Record<string, string>;
};

function statePath(repoRoot: string): string {
  return path.join(repoRoot, ".dh", "cache", "workspace-freshness.json");
}

function readPrior(repoRoot: string): StoredFingerprint | undefined {
  const file = statePath(repoRoot);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as StoredFingerprint;
}

function writePrior(repoRoot: string, fingerprint: WorkspaceFingerprint): void {
  const file = statePath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fileFingerprints = Object.fromEntries(fingerprint.files.map((entry) => [entry, fileFingerprint(repoRoot, entry)]));
  fs.writeFileSync(file, `${JSON.stringify({ ...fingerprint, fileFingerprints }, null, 2)}\n`, { mode: 0o600 });
}
