import type { AgentModelAssignment } from "../../../../shared/src/types/model.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";

export class AgentModelAssignmentsRepo {
  constructor(private readonly repoRoot: string) {}

  async list(): Promise<AgentModelAssignment[]> {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT agent_id, provider_id, model_id, variant_id, updated_at
      FROM agent_model_assignments
      ORDER BY agent_id ASC
    `).all() as Array<{
      agent_id: string;
      provider_id: string;
      model_id: string;
      variant_id: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      agentId: row.agent_id,
      providerId: row.provider_id,
      modelId: row.model_id,
      variantId: row.variant_id,
      updatedAt: row.updated_at,
    }));
  }

  async findByAgentId(agentId: string): Promise<AgentModelAssignment | undefined> {
    const assignments = await this.list();
    return assignments.find((entry) => entry.agentId === agentId);
  }

  async saveAssignment(input: Omit<AgentModelAssignment, "updatedAt">): Promise<AgentModelAssignment> {
    const nextAssignment: AgentModelAssignment = { ...input, updatedAt: nowIso() };
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO agent_model_assignments (agent_id, provider_id, model_id, variant_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        model_id = excluded.model_id,
        variant_id = excluded.variant_id,
        updated_at = excluded.updated_at
    `).run(
      nextAssignment.agentId,
      nextAssignment.providerId,
      nextAssignment.modelId,
      nextAssignment.variantId,
      nextAssignment.updatedAt,
    );
    return nextAssignment;
  }
}
