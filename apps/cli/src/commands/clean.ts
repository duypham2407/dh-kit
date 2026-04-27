import fs from "node:fs/promises";
import path from "node:path";

const CLEAN_HELP = `dh clean --yes

Removes local dh runtime state for the current repository.

This deletes:
  .dh/

Use when:
  - you want to rebuild the index from scratch
  - local SQLite/cache state is broken
  - you want to reset project-local dh data

Examples:
  dh clean --yes`;

export async function runCleanCommand(args: string[], repoRoot: string): Promise<number> {
  if (!args.includes("--yes")) {
    process.stderr.write(`${CLEAN_HELP}\n`);
    return 1;
  }

  const dhDir = path.join(repoRoot, ".dh");
  await fs.rm(dhDir, { recursive: true, force: true });

  process.stdout.write([
    `removed local dh state: ${dhDir}`,
    `next steps:`,
    `  1. dh status`,
    `  2. dh index`,
    `  3. dh ask "how does auth work?"`,
  ].join("\n") + "\n");

  return 0;
}
