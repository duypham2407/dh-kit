import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "../../../shared/src/utils/ids.js";
import { buildEvidencePackets } from "./build-evidence-packets.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { readTelemetryEvents } from "../semantic/telemetry-collector.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-evidence-test-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("buildEvidencePackets", () => {
  it("documents this builder as retrieval-local non-authoritative packet shape", async () => {
    const repo = makeTmpRepo();
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const packets = await buildEvidencePackets(repo, [{
      entityType: "file",
      entityId: createId("result"),
      filePath: "src/auth.ts",
      lineRange: [1, 10],
      sourceTool: "keyword_search",
      matchReason: "legacy packet builder compatibility path",
      rawScore: 0.5,
      normalizedScore: 0.8,
      metadata: {},
    }]);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.sourceTools).toContain("keyword_search");
    // Guardrail: this builder remains retrieval-local and non-authoritative.
    expect(packets[0]!.reason).toContain("legacy packet builder compatibility path");
  });

  it("does not expose canonical Rust-hosted build-evidence authority metadata", async () => {
    const repo = makeTmpRepo();
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const packets = await buildEvidencePackets(repo, [{
      entityType: "file",
      entityId: createId("result"),
      filePath: "src/auth.ts",
      lineRange: [1, 10],
      sourceTool: "semantic_search",
      matchReason: "legacy retrieval-local evidence",
      rawScore: 0.5,
      normalizedScore: 0.8,
      metadata: {},
    }]);

    const packet = packets[0] as Record<string, unknown>;
    expect(packet.answerState).toBeUndefined();
    expect(packet.questionClass).toBeUndefined();
    expect(packet.bounds).toBeUndefined();
    expect(packet.sourceTools).toEqual(["semantic_search"]);
    expect(packet.reason).toBe("legacy retrieval-local evidence");
  });

  it("keeps repo-relative contract for valid paths", async () => {
    const repo = makeTmpRepo();
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export function login() { return 'ok'; }\n", "utf8");

    const packets = await buildEvidencePackets(repo, [{
      entityType: "file",
      entityId: createId("result"),
      filePath: "src/auth.ts",
      lineRange: [1, 10],
      sourceTool: "keyword_search",
      matchReason: "match",
      rawScore: 0.5,
      normalizedScore: 0.8,
      metadata: {},
    }]);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.filePath).toBe("src/auth.ts");
    expect(packets[0]!.snippet).not.toBe("Snippet unavailable.");
  });

  it("records observability telemetry for unresolved paths", async () => {
    const repo = makeTmpRepo();
    const packets = await buildEvidencePackets(repo, [{
      entityType: "file",
      entityId: createId("result"),
      filePath: "../../etc/passwd",
      lineRange: [1, 1],
      sourceTool: "semantic_search",
      matchReason: "legacy path",
      rawScore: 0.1,
      normalizedScore: 0.1,
      metadata: {},
    }]);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.snippet).toBe("Snippet unavailable.");

    const events = readTelemetryEvents(repo);
    const unresolvedEvents = events.filter((event) => event.kind === "evidence_path_unresolved");
    expect(unresolvedEvents).toHaveLength(1);
    expect(unresolvedEvents[0]!.details.filePath).toBe("../../etc/passwd");
    expect(unresolvedEvents[0]!.details.failureKind).toBe("normalization_failed");
  });

  it("records file-read failure distinctly from normalization failure", async () => {
    const repo = makeTmpRepo();
    const packets = await buildEvidencePackets(repo, [{
      entityType: "file",
      entityId: createId("result"),
      filePath: "src/missing.ts",
      lineRange: [1, 1],
      sourceTool: "semantic_search",
      matchReason: "missing file",
      rawScore: 0.2,
      normalizedScore: 0.2,
      metadata: {},
    }]);

    expect(packets).toHaveLength(1);
    expect(packets[0]!.snippet).toBe("Snippet unavailable.");

    const events = readTelemetryEvents(repo);
    const unresolvedEvents = events.filter((event) => event.kind === "evidence_path_unresolved");
    expect(unresolvedEvents).toHaveLength(1);
    expect(unresolvedEvents[0]!.details.normalizedFilePath).toBe("src/missing.ts");
    expect(unresolvedEvents[0]!.details.failureKind).toBe("file_read_failed");
  });
});
