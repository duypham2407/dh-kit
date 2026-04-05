import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  checkDatabaseIntegrity,
  checkDatabaseReadable,
  backupDatabase,
  attemptDatabaseRecovery,
} from "./db-health.js";
import { openDhDatabase, closeDhDatabase, resolveSqliteDbPath } from "./db.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-dbhealth-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("checkDatabaseIntegrity", () => {
  it("returns ok: true for a healthy database", () => {
    const repo = makeTmpRepo();
    openDhDatabase(repo); // bootstrap schema
    closeDhDatabase(repo); // close the cached handle so integrity check opens fresh

    const result = checkDatabaseIntegrity(repo);
    expect(result.ok).toBe(true);
    expect(result.details).toEqual(["ok"]);
  });

  it("returns ok: false when DB file does not exist", () => {
    const repo = makeTmpRepo();
    // Don't create the DB
    const result = checkDatabaseIntegrity(repo);
    expect(result.ok).toBe(false);
    expect(result.details[0]).toContain("not found");
  });

  it("returns ok: false for a corrupt database file", () => {
    const repo = makeTmpRepo();
    // Create a corrupt file
    const dbPath = resolveSqliteDbPath(repo);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, "THIS IS NOT A VALID SQLITE DATABASE FILE");

    const result = checkDatabaseIntegrity(repo);
    expect(result.ok).toBe(false);
    expect(result.details[0]).toContain("Failed to run integrity check");
  });
});

describe("checkDatabaseReadable", () => {
  it("returns readable: true for a healthy database", () => {
    const repo = makeTmpRepo();
    openDhDatabase(repo);
    closeDhDatabase(repo);

    const result = checkDatabaseReadable(repo);
    expect(result.readable).toBe(true);
  });

  it("returns readable: false for missing database", () => {
    const repo = makeTmpRepo();
    const result = checkDatabaseReadable(repo);
    expect(result.readable).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("backupDatabase", () => {
  it("creates a backup of an existing database", () => {
    const repo = makeTmpRepo();
    openDhDatabase(repo);
    closeDhDatabase(repo);

    const backupPath = backupDatabase(repo);
    expect(backupPath).toBeDefined();
    expect(fs.existsSync(backupPath!)).toBe(true);

    // Backup should be in the backups directory
    expect(backupPath!).toContain("backups");
  });

  it("returns undefined when no DB exists", () => {
    const repo = makeTmpRepo();
    const result = backupDatabase(repo);
    expect(result).toBeUndefined();
  });
});

describe("attemptDatabaseRecovery", () => {
  it("recovers a healthy database (no-op recovery)", () => {
    const repo = makeTmpRepo();
    openDhDatabase(repo);

    const result = attemptDatabaseRecovery(repo);
    expect(result.success).toBe(true);
    expect(result.steps.length).toBeGreaterThanOrEqual(3);

    // backup, wal_checkpoint, vacuum, integrity_recheck should all pass
    const stepNames = result.steps.map((s) => s.name);
    expect(stepNames).toContain("backup");
    expect(stepNames).toContain("wal_checkpoint");
    expect(stepNames).toContain("vacuum");
    expect(stepNames).toContain("integrity_recheck");

    for (const step of result.steps) {
      expect(step.success).toBe(true);
    }
  });

  it("recreates database from schema when file is corrupt", () => {
    const repo = makeTmpRepo();

    // Create a corrupt DB file
    const dbPath = resolveSqliteDbPath(repo);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, "CORRUPT DATA HERE!");

    const result = attemptDatabaseRecovery(repo);

    // The recovery should succeed via recreate_schema
    const recreateStep = result.steps.find((s) => s.name === "recreate_schema");
    expect(recreateStep).toBeDefined();
    expect(recreateStep!.success).toBe(true);
    expect(recreateStep!.detail).toContain("recreated");

    // The DB should now be healthy
    closeDhDatabase(repo);
    const integrity = checkDatabaseIntegrity(repo);
    expect(integrity.ok).toBe(true);
  });
});
