#!/usr/bin/env node

/**
 * Doctor snapshot regression checker.
 *
 * Reads a DoctorSnapshot JSON file (or stdin) and checks for regressions:
 * - Missing required tables
 * - Embedding key not set (when semantic mode is not "off")
 * - No chunks or embeddings indexed
 * - Go binary or SQLite bridge not ready
 *
 * Exit code 0 = healthy, 1 = regressions found.
 *
 * Usage:
 *   node scripts/check-doctor-snapshot.mjs <snapshot.json>
 *   cat snapshot.json | node scripts/check-doctor-snapshot.mjs
 */

import fs from "node:fs";

const input = process.argv[2]
  ? fs.readFileSync(process.argv[2], "utf8")
  : fs.readFileSync(0, "utf8");

const snapshot = JSON.parse(input);

const issues = [];

if (snapshot.tables?.missing?.length > 0) {
  issues.push(`Missing tables: ${snapshot.tables.missing.join(", ")}`);
}

if (!snapshot.embeddingKeySet && snapshot.semanticMode !== "off") {
  issues.push(`Embedding API key not set (semantic mode: ${snapshot.semanticMode})`);
}

if (snapshot.chunks === 0) {
  issues.push("No chunks indexed");
}

if (snapshot.embeddings === 0 && snapshot.chunks > 0) {
  issues.push("Chunks exist but no embeddings generated");
}

if (!snapshot.goBinaryReady) {
  issues.push("Go binary not ready");
}

if (!snapshot.sqliteBridgeReady) {
  issues.push("SQLite bridge not ready");
}

if (snapshot.providers === 0) {
  issues.push("No providers registered");
}

if (snapshot.models === 0) {
  issues.push("No models registered");
}

if (issues.length > 0) {
  console.error("Doctor snapshot regressions detected:");
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  process.exit(1);
} else {
  console.log("Doctor snapshot healthy");
  console.log(`  Tables: ${snapshot.tables.present}/${snapshot.tables.required}`);
  console.log(`  Chunks: ${snapshot.chunks}, Embeddings: ${snapshot.embeddings}`);
  console.log(`  Providers: ${snapshot.providers}, Models: ${snapshot.models}`);
  console.log(`  Go binary: ${snapshot.goBinaryReady ? "ready" : "not ready"}`);
  console.log(`  Bridge: ${snapshot.sqliteBridgeReady ? "ready" : "not ready"}`);
}
