/**
 * Snapshot capture script for CI.
 *
 * When run via:
 *   vitest run packages/runtime/src/diagnostics/capture-snapshot.test.ts
 *
 * It writes dist/diagnostics/doctor-snapshot.json so the nightly workflow
 * can upload it as an artifact and check it for regressions.
 *
 * This is a vitest test (not a unit test) so that vitest's TypeScript resolver
 * handles the .ts → .js import remapping that plain `node` cannot do.
 */

import { it } from "vitest";
import { runDoctor } from "./doctor.js";
import fs from "node:fs";
import path from "node:path";

it("captures doctor snapshot to dist/diagnostics/doctor-snapshot.json", async () => {
  // Use the repo root (process.cwd() from where vitest is run).
  const repoRoot = process.cwd();
  const report = await runDoctor(repoRoot);

  const outDir = path.join(repoRoot, "dist", "diagnostics");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "doctor-snapshot.json");
  fs.writeFileSync(outPath, JSON.stringify(report.snapshot, null, 2));

  // Non-fatal: just log the summary so it shows up in CI output.
  console.log("[doctor-snapshot] written to", outPath);
  console.log("[doctor-snapshot] ok:", report.snapshot.ok);
  console.log("[doctor-snapshot] tables:", report.snapshot.tables.present, "/", report.snapshot.tables.required);
}, 30_000);
