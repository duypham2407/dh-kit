import { openDhDatabase } from "../db.js";
import { nowIso } from "../../../../shared/src/utils/time.js";

export class ConfigRepo {
  constructor(private readonly repoRoot: string) {}

  read<T>(key: string): T | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT value_json FROM config WHERE key = ?").get(key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }

  write<T>(key: string, value: T): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO config (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value), nowIso());
  }
}
