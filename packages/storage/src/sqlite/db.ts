import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function resolveSqliteDbPath(repoRoot: string): string {
  return path.join(repoRoot, ".dh", "sqlite", "dh.db");
}

const dbCache = new Map<string, DatabaseSync>();

/**
 * Open (or reuse) the SQLite database for the given repo root.
 * The returned database MUST NOT be closed by callers — it is shared.
 * Call closeDhDatabase() only during graceful shutdown or tests.
 */
export function openDhDatabase(repoRoot: string): DatabaseSync {
  const dbPath = resolveSqliteDbPath(repoRoot);
  const cached = dbCache.get(dbPath);
  if (cached) {
    return cached;
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  bootstrapDhDatabase(database);
  dbCache.set(dbPath, database);
  return database;
}

/**
 * Close a cached database connection. Used in tests and graceful shutdown.
 */
export function closeDhDatabase(repoRoot: string): void {
  const dbPath = resolveSqliteDbPath(repoRoot);
  const cached = dbCache.get(dbPath);
  if (cached) {
    cached.close();
    dbCache.delete(dbPath);
  }
}

export function bootstrapDhDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_model_assignments (
      agent_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      repo_root TEXT NOT NULL,
      lane TEXT NOT NULL,
      lane_locked INTEGER NOT NULL,
      current_stage TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      semantic_mode TEXT NOT NULL,
      tool_enforcement_level TEXT NOT NULL,
      active_work_item_ids_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_state (
      session_id TEXT PRIMARY KEY,
      lane TEXT NOT NULL,
      stage TEXT NOT NULL,
      stage_status TEXT NOT NULL,
      previous_stage TEXT,
      next_stage TEXT,
      gate_status TEXT NOT NULL,
      blockers_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions (session_id)
    );

    CREATE TABLE IF NOT EXISTS execution_envelopes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      lane TEXT NOT NULL,
      role TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      work_item_id TEXT,
      resolved_model_json TEXT NOT NULL,
      active_skills_json TEXT NOT NULL,
      active_mcps_json TEXT NOT NULL,
      required_tools_json TEXT NOT NULL,
      semantic_mode TEXT NOT NULL,
      evidence_policy TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions (session_id)
    );

    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      lane TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      dependencies_json TEXT NOT NULL,
      parallelizable INTEGER NOT NULL,
      execution_group TEXT,
      status TEXT NOT NULL,
      target_areas_json TEXT NOT NULL,
      acceptance_json TEXT NOT NULL,
      validation_plan_json TEXT NOT NULL,
      review_status TEXT NOT NULL,
      test_status TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions (session_id)
    );

    CREATE TABLE IF NOT EXISTS tool_usage_audit (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      envelope_id TEXT NOT NULL,
      role TEXT NOT NULL,
      intent TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skill_activation_audit (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      envelope_id TEXT NOT NULL,
      role TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      activation_reason TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_route_audit (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      envelope_id TEXT NOT NULL,
      role TEXT NOT NULL,
      mcp_name TEXT NOT NULL,
      route_reason TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hook_invocation_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      envelope_id TEXT NOT NULL,
      hook_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      output_json TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_outputs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      envelope_id TEXT NOT NULL,
      role TEXT NOT NULL,
      stage TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      symbol_id TEXT,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      language TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks (file_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks (content_hash);

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      vector_dim INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES chunks (id)
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings (chunk_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings (model_name);

    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'module',
      language TEXT,
      content_hash TEXT,
      mtime REAL NOT NULL DEFAULT 0,
      parse_status TEXT NOT NULL DEFAULT 'pending',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_path ON graph_nodes (path);

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      from_node_id TEXT NOT NULL,
      to_node_id TEXT NOT NULL,
      edge_type TEXT NOT NULL DEFAULT 'import',
      line INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (from_node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE,
      FOREIGN KEY (to_node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges (from_node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges (to_node_id);

    CREATE TABLE IF NOT EXISTS graph_symbols (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'unknown',
      is_export INTEGER NOT NULL DEFAULT 0,
      line INTEGER NOT NULL DEFAULT 0,
      start_line INTEGER,
      end_line INTEGER,
      signature TEXT,
      doc_comment TEXT,
      scope TEXT,
      FOREIGN KEY (node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_graph_symbols_node ON graph_symbols (node_id);
    CREATE INDEX IF NOT EXISTS idx_graph_symbols_name ON graph_symbols (name);

    CREATE TABLE IF NOT EXISTS graph_symbol_references (
      id TEXT PRIMARY KEY,
      symbol_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      line INTEGER NOT NULL,
      col INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'usage',
      FOREIGN KEY (symbol_id) REFERENCES graph_symbols (id) ON DELETE CASCADE,
      FOREIGN KEY (node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_graph_refs_symbol ON graph_symbol_references (symbol_id);
    CREATE INDEX IF NOT EXISTS idx_graph_refs_node ON graph_symbol_references (node_id);

    CREATE TABLE IF NOT EXISTS graph_calls (
      id TEXT PRIMARY KEY,
      caller_symbol_id TEXT NOT NULL,
      callee_name TEXT NOT NULL,
      callee_node_id TEXT,
      callee_symbol_id TEXT,
      line INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (caller_symbol_id) REFERENCES graph_symbols (id) ON DELETE CASCADE,
      FOREIGN KEY (callee_node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE,
      FOREIGN KEY (callee_symbol_id) REFERENCES graph_symbols (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_graph_calls_caller ON graph_calls (caller_symbol_id);
    CREATE INDEX IF NOT EXISTS idx_graph_calls_callee ON graph_calls (callee_name);
  `);
}
