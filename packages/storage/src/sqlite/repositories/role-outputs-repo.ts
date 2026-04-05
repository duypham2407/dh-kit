import type { RoleOutputRecord } from "../../../../shared/src/types/role-output.js";
import { openDhDatabase } from "../db.js";

export class RoleOutputsRepo {
  constructor(private readonly repoRoot: string) {}

  save(record: RoleOutputRecord): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO role_outputs (
        id, session_id, envelope_id, role, stage, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.envelopeId,
      record.role,
      record.stage,
      JSON.stringify(record.payload),
      record.createdAt,
    );
  }
}
