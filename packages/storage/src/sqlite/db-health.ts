/**
 * Database health checks and recovery utilities.
 *
 * Provides:
 *   - `checkDatabaseIntegrity()` — runs `PRAGMA integrity_check` and detects corruption
 *   - `attemptDatabaseRecovery()` — tries VACUUM, WAL checkpoint, and rebuild
 *   - `backupDatabase()` — copies the DB file to a timestamped backup
 *
 * These are designed to be called from `doctor.ts` and from recovery commands.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveSqliteDbPath, openDhDatabase, closeDhDatabase, bootstrapDhDatabase } from "./db.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntegrityResult = {
  ok: boolean;
  details: string[];
};

export type RecoveryResult = {
  success: boolean;
  steps: RecoveryStep[];
};

export type RecoveryStep = {
  name: string;
  success: boolean;
  detail: string;
};

// ---------------------------------------------------------------------------
// Integrity check
// ---------------------------------------------------------------------------

/**
 * Run `PRAGMA integrity_check` on the project database.
 *
 * Returns `{ ok: true }` when the database passes.
 * If the database file doesn't exist, returns ok: false with an explanatory detail.
 * If the database is corrupted or unreadable, catches the error and reports it.
 */
export function checkDatabaseIntegrity(repoRoot: string): IntegrityResult {
  const dbPath = resolveSqliteDbPath(repoRoot);

  if (!fs.existsSync(dbPath)) {
    return { ok: false, details: [`Database file not found: ${dbPath}`] };
  }

  let db: DatabaseSync | undefined;
  try {
    // Open directly (bypass cache) so corruption in the cached handle doesn't mask issues
    db = new DatabaseSync(dbPath);
    const rows = db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
    const details = rows.map((r) => r.integrity_check);
    const ok = details.length === 1 && details[0] === "ok";
    return { ok, details };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, details: [`Failed to run integrity check: ${msg}`] };
  } finally {
    try { db?.close(); } catch { /* ignore close error */ }
  }
}

/**
 * Quick liveness probe: can we open the DB and read from sqlite_master?
 */
export function checkDatabaseReadable(repoRoot: string): { readable: boolean; error?: string } {
  const dbPath = resolveSqliteDbPath(repoRoot);
  if (!fs.existsSync(dbPath)) {
    return { readable: false, error: `Database file not found: ${dbPath}` };
  }

  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath);
    db.prepare("SELECT count(*) as c FROM sqlite_master").get();
    return { readable: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { readable: false, error: msg };
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/**
 * Copy the current DB file to `.dh/sqlite/backups/dh-<timestamp>.db`.
 * Returns the backup path, or undefined if no DB file exists.
 */
export function backupDatabase(repoRoot: string): string | undefined {
  const dbPath = resolveSqliteDbPath(repoRoot);
  if (!fs.existsSync(dbPath)) return undefined;

  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `dh-${stamp}.db`);
  fs.copyFileSync(dbPath, backupPath);

  // Also copy WAL and SHM if present
  for (const suffix of ["-wal", "-shm"]) {
    const src = dbPath + suffix;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, backupPath + suffix);
    }
  }

  return backupPath;
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * Attempt a multi-step database recovery:
 *
 *   1. Backup the current DB.
 *   2. WAL checkpoint (force WAL changes into the main DB file).
 *   3. VACUUM (rebuild the DB file, reclaiming space and fixing minor issues).
 *   4. Re-run integrity check to confirm the fix.
 *   5. If still corrupt, delete + recreate the DB from schema (last resort).
 *
 * The function always closes and re-opens the cached DB handle so the
 * runtime picks up the repaired file.
 */
export function attemptDatabaseRecovery(repoRoot: string): RecoveryResult {
  const steps: RecoveryStep[] = [];

  // Step 1: Backup
  try {
    const backupPath = backupDatabase(repoRoot);
    steps.push({
      name: "backup",
      success: backupPath !== undefined,
      detail: backupPath ? `Backup created: ${backupPath}` : "No DB file to back up.",
    });
  } catch (err: unknown) {
    steps.push({ name: "backup", success: false, detail: `Backup failed: ${err instanceof Error ? err.message : String(err)}` });
  }

  // Close the cached handle so recovery operates on the raw file
  closeDhDatabase(repoRoot);

  const dbPath = resolveSqliteDbPath(repoRoot);

  // Step 2: WAL checkpoint
  if (fs.existsSync(dbPath)) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(dbPath);
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      steps.push({ name: "wal_checkpoint", success: true, detail: "WAL checkpoint completed." });
    } catch (err: unknown) {
      steps.push({ name: "wal_checkpoint", success: false, detail: `WAL checkpoint failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }

  // Step 3: VACUUM
  if (fs.existsSync(dbPath)) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(dbPath);
      db.exec("VACUUM");
      steps.push({ name: "vacuum", success: true, detail: "VACUUM completed." });
    } catch (err: unknown) {
      steps.push({ name: "vacuum", success: false, detail: `VACUUM failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }

  // Step 4: Re-check integrity
  const postCheck = checkDatabaseIntegrity(repoRoot);
  steps.push({
    name: "integrity_recheck",
    success: postCheck.ok,
    detail: postCheck.ok ? "Integrity check passed after recovery." : `Still corrupt: ${postCheck.details.join("; ")}`,
  });

  // Step 5: If still corrupt, recreate from schema (nuclear option)
  if (!postCheck.ok) {
    try {
      // Remove the corrupt file
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      for (const suffix of ["-wal", "-shm"]) {
        const suf = dbPath + suffix;
        if (fs.existsSync(suf)) fs.unlinkSync(suf);
      }

      // Recreate via the normal bootstrap path
      const fresh = openDhDatabase(repoRoot);
      // Verify the fresh DB
      const freshCheck = checkDatabaseIntegrity(repoRoot);
      steps.push({
        name: "recreate_schema",
        success: freshCheck.ok,
        detail: freshCheck.ok
          ? "Database recreated from schema. All prior data was lost."
          : `Recreated DB still fails integrity: ${freshCheck.details.join("; ")}`,
      });
    } catch (err: unknown) {
      steps.push({ name: "recreate_schema", success: false, detail: `Schema recreation failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Re-open the cached handle for the rest of the process
  try {
    openDhDatabase(repoRoot);
  } catch { /* will be caught by subsequent operations */ }

  return {
    success: steps.every((s) => s.success) || steps.find((s) => s.name === "recreate_schema")?.success === true,
    steps,
  };
}
