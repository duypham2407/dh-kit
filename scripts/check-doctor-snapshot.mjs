#!/usr/bin/env node

/**
 * Doctor snapshot regression checker.
 *
 * Reads a DoctorSnapshot JSON file (or stdin) and checks for regressions:
 * - Missing required tables
 * - Lifecycle classifications marked as unsupported/misconfigured
 * - Embedding key not set (when semantic mode is not "off")
 * - No chunks or embeddings indexed
 * - Runtime release binary or SQLite bridge not ready
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
const warnings = [];

const embeddingKeyMissing = !snapshot.embeddingKeySet && snapshot.semanticMode !== "off";
const optionalEmbeddingKeyOnlyMisconfigured = embeddingKeyMissing
  && snapshot.capabilityToolingStatus === "misconfigured"
  && snapshot.installDistributionStatus !== "misconfigured"
  && snapshot.runtimeWorkspaceReadinessStatus !== "misconfigured"
  && snapshot.installDistributionStatus !== "unsupported"
  && snapshot.runtimeWorkspaceReadinessStatus !== "unsupported"
  && snapshot.providers > 0
  && snapshot.models > 0;

if (snapshot.lifecycleStatus === "unsupported") {
  issues.push(`Overall lifecycle status is ${snapshot.lifecycleStatus}`);
} else if (snapshot.lifecycleStatus === "misconfigured" && !optionalEmbeddingKeyOnlyMisconfigured) {
  issues.push(`Overall lifecycle status is ${snapshot.lifecycleStatus}`);
}

if (["unsupported", "misconfigured"].includes(snapshot.installDistributionStatus)) {
  issues.push(`Install/distribution status is ${snapshot.installDistributionStatus}`);
}

if (["unsupported", "misconfigured"].includes(snapshot.runtimeWorkspaceReadinessStatus)) {
  issues.push(`Runtime/workspace readiness status is ${snapshot.runtimeWorkspaceReadinessStatus}`);
}

if (snapshot.capabilityToolingStatus === "unsupported") {
  issues.push(`Capability/tooling status is ${snapshot.capabilityToolingStatus}`);
} else if (snapshot.capabilityToolingStatus === "misconfigured" && !optionalEmbeddingKeyOnlyMisconfigured) {
  issues.push(`Capability/tooling status is ${snapshot.capabilityToolingStatus}`);
}

if (snapshot.tables?.missing?.length > 0) {
  issues.push(`Missing tables: ${snapshot.tables.missing.join(", ")}`);
}

if (embeddingKeyMissing) {
  if (optionalEmbeddingKeyOnlyMisconfigured) {
    warnings.push(`Embedding API key not set (semantic mode: ${snapshot.semanticMode}) — optional local capability misconfiguration is expected`);
  } else {
    issues.push(`Embedding API key not set (semantic mode: ${snapshot.semanticMode})`);
  }
}

if (snapshot.chunks === 0) {
  issues.push("No chunks indexed");
}

if (snapshot.embeddings === 0 && snapshot.chunks > 0) {
  issues.push("Chunks exist but no embeddings generated");
}

if (!snapshot.runtimeBinaryReady) {
  issues.push("Runtime release binary not ready");
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
  if (warnings.length > 0) {
    console.error("Doctor snapshot warnings:");
    for (const warning of warnings) {
      console.error(`  - ${warning}`);
    }
  }
  process.exit(1);
} else {
  console.log("Doctor snapshot healthy");
  if (snapshot.lifecycleStatus) {
    console.log(`  Lifecycle: overall=${snapshot.lifecycleStatus}, install=${snapshot.installDistributionStatus}, runtime=${snapshot.runtimeWorkspaceReadinessStatus}, capability=${snapshot.capabilityToolingStatus}`);
  }
  console.log(`  Tables: ${snapshot.tables.present}/${snapshot.tables.required}`);
  console.log(`  Chunks: ${snapshot.chunks}, Embeddings: ${snapshot.embeddings}`);
  console.log(`  Providers: ${snapshot.providers}, Models: ${snapshot.models}`);
  console.log(`  Runtime binary: ${snapshot.runtimeBinaryReady ? "ready" : "not ready"}`);
  console.log(`  Bridge: ${snapshot.sqliteBridgeReady ? "ready" : "not ready"}`);
  if (warnings.length > 0) {
    console.log("Doctor snapshot warnings:");
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
}
