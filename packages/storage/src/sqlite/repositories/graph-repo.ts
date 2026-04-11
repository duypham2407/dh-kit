import { createHash } from "node:crypto";
import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import type {
  GraphCall,
  GraphEdge,
  GraphNode,
  GraphReferenceKind,
  GraphSymbol,
  GraphSymbolReference,
} from "../../../../shared/src/types/graph.js";
import { openDhDatabase } from "../db.js";

type RawGraphNode = {
  id: string;
  path: string;
  kind: string;
  language: string | null;
  content_hash: string | null;
  mtime: number;
  parse_status: "pending" | "ok" | "error";
  updated_at: string;
};

type RawGraphEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: GraphEdge["edgeType"];
  line: number;
};

type RawGraphSymbol = {
  id: string;
  node_id: string;
  name: string;
  kind: string;
  is_export: number;
  line: number;
  start_line: number | null;
  end_line: number | null;
  signature: string | null;
  doc_comment: string | null;
  scope: string | null;
};

type RawGraphReference = {
  id: string;
  symbol_id: string;
  node_id: string;
  line: number;
  col: number;
  kind: GraphReferenceKind;
};

type RawGraphCall = {
  id: string;
  caller_symbol_id: string;
  callee_name: string;
  callee_node_id: string | null;
  callee_symbol_id: string | null;
  line: number;
};

export type GraphNodeInput = {
  path: string;
  kind?: string;
  language?: string | null;
  contentHash?: string | null;
  mtime?: number;
  parseStatus?: GraphNode["parseStatus"];
};

export type ReplaceGraphNodeDataInput = {
  nodeId: string;
  edges: Array<Omit<GraphEdge, "id" | "fromNodeId">>;
  symbols: Array<Omit<GraphSymbol, "id" | "nodeId">>;
  references: Array<Omit<GraphSymbolReference, "id" | "nodeId">>;
  calls: Array<Omit<GraphCall, "id">>;
};

function toNode(raw: RawGraphNode): GraphNode {
  return {
    id: raw.id,
    path: raw.path,
    kind: raw.kind,
    language: raw.language,
    contentHash: raw.content_hash,
    mtime: raw.mtime,
    parseStatus: raw.parse_status,
    updatedAt: raw.updated_at,
  };
}

function toEdge(raw: RawGraphEdge): GraphEdge {
  return {
    id: raw.id,
    fromNodeId: raw.from_node_id,
    toNodeId: raw.to_node_id,
    edgeType: raw.edge_type,
    line: raw.line,
  };
}

function toSymbol(raw: RawGraphSymbol): GraphSymbol {
  return {
    id: raw.id,
    nodeId: raw.node_id,
    name: raw.name,
    kind: raw.kind,
    isExport: raw.is_export === 1,
    line: raw.line,
    startLine: raw.start_line,
    endLine: raw.end_line,
    signature: raw.signature,
    docComment: raw.doc_comment,
    scope: raw.scope,
  };
}

function toReference(raw: RawGraphReference): GraphSymbolReference {
  return {
    id: raw.id,
    symbolId: raw.symbol_id,
    nodeId: raw.node_id,
    line: raw.line,
    col: raw.col,
    kind: raw.kind,
  };
}

function toCall(raw: RawGraphCall): GraphCall {
  return {
    id: raw.id,
    callerSymbolId: raw.caller_symbol_id,
    calleeName: raw.callee_name,
    calleeNodeId: raw.callee_node_id,
    calleeSymbolId: raw.callee_symbol_id,
    line: raw.line,
  };
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export class GraphRepo {
  constructor(private readonly repoRoot: string) {}

  upsertNode(input: GraphNodeInput): GraphNode {
    const database = openDhDatabase(this.repoRoot);
    const existing = this.findNodeByPath(input.path);
    const id = existing?.id ?? createId("gnode");
    const updatedAt = nowIso();
    database.prepare(`
      INSERT INTO graph_nodes (id, path, kind, language, content_hash, mtime, parse_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        kind = excluded.kind,
        language = excluded.language,
        content_hash = excluded.content_hash,
        mtime = excluded.mtime,
        parse_status = excluded.parse_status,
        updated_at = excluded.updated_at
    `).run(
      id,
      input.path,
      input.kind ?? "module",
      input.language ?? null,
      input.contentHash ?? null,
      input.mtime ?? 0,
      input.parseStatus ?? "pending",
      updatedAt,
    );
    return this.findNodeByPath(input.path)!;
  }

  findNodeByPath(filePath: string): GraphNode | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT * FROM graph_nodes WHERE path = ? LIMIT 1").get(filePath) as RawGraphNode | undefined;
    return row ? toNode(row) : undefined;
  }

  findNodeById(nodeId: string): GraphNode | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare("SELECT * FROM graph_nodes WHERE id = ? LIMIT 1").get(nodeId) as RawGraphNode | undefined;
    return row ? toNode(row) : undefined;
  }

  listNodes(): GraphNode[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT * FROM graph_nodes ORDER BY path ASC").all() as RawGraphNode[];
    return rows.map(toNode);
  }

  deleteNode(nodeId: string): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM graph_nodes WHERE id = ?").run(nodeId);
  }

  replaceEdgesForNode(nodeId: string, edges: Array<Omit<GraphEdge, "id" | "fromNodeId">>): GraphEdge[] {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM graph_edges WHERE from_node_id = ?").run(nodeId);
    const insert = database.prepare(`
      INSERT INTO graph_edges (id, from_node_id, to_node_id, edge_type, line)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const edge of edges) {
      insert.run(createId("gedge"), nodeId, edge.toNodeId, edge.edgeType, edge.line);
    }
    return this.findEdgesFromNode(nodeId);
  }

  findEdgesFromNode(nodeId: string): GraphEdge[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare("SELECT * FROM graph_edges WHERE from_node_id = ? ORDER BY line ASC")
      .all(nodeId) as RawGraphEdge[];
    return rows.map(toEdge);
  }

  findDependencies(nodeId: string): GraphNode[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT gn.*
      FROM graph_edges ge
      JOIN graph_nodes gn ON gn.id = ge.to_node_id
      WHERE ge.from_node_id = ?
      ORDER BY gn.path ASC
    `).all(nodeId) as RawGraphNode[];
    return rows.map(toNode);
  }

  findDependents(nodeId: string): GraphNode[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT gn.*
      FROM graph_edges ge
      JOIN graph_nodes gn ON gn.id = ge.from_node_id
      WHERE ge.to_node_id = ?
      ORDER BY gn.path ASC
    `).all(nodeId) as RawGraphNode[];
    return rows.map(toNode);
  }

  replaceSymbolsForNode(nodeId: string, symbols: Array<Omit<GraphSymbol, "id" | "nodeId">>): GraphSymbol[] {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM graph_symbols WHERE node_id = ?").run(nodeId);
    const insert = database.prepare(`
      INSERT INTO graph_symbols (
        id, node_id, name, kind, is_export, line, start_line, end_line, signature, doc_comment, scope
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const symbol of symbols) {
      insert.run(
        createId("gsym"),
        nodeId,
        symbol.name,
        symbol.kind,
        symbol.isExport ? 1 : 0,
        symbol.line,
        symbol.startLine ?? null,
        symbol.endLine ?? null,
        symbol.signature ?? null,
        symbol.docComment ?? null,
        symbol.scope ?? null,
      );
    }
    return this.findSymbolsByNode(nodeId);
  }

  findSymbolsByNode(nodeId: string): GraphSymbol[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare("SELECT * FROM graph_symbols WHERE node_id = ? ORDER BY line ASC")
      .all(nodeId) as RawGraphSymbol[];
    return rows.map(toSymbol);
  }

  findSymbolByName(name: string): GraphSymbol[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare("SELECT * FROM graph_symbols WHERE name = ? ORDER BY line ASC").all(name) as RawGraphSymbol[];
    return rows.map(toSymbol);
  }

  replaceReferencesForNode(nodeId: string, references: Array<Omit<GraphSymbolReference, "id" | "nodeId">>): GraphSymbolReference[] {
    const database = openDhDatabase(this.repoRoot);
    database.prepare("DELETE FROM graph_symbol_references WHERE node_id = ?").run(nodeId);
    const insert = database.prepare(`
      INSERT INTO graph_symbol_references (id, symbol_id, node_id, line, col, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const ref of references) {
      insert.run(createId("gref"), ref.symbolId, nodeId, ref.line, ref.col, ref.kind);
    }
    return this.findReferencesByNode(nodeId);
  }

  findReferencesByNode(nodeId: string): GraphSymbolReference[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare("SELECT * FROM graph_symbol_references WHERE node_id = ? ORDER BY line ASC, col ASC")
      .all(nodeId) as RawGraphReference[];
    return rows.map(toReference);
  }

  findReferencesBySymbol(symbolId: string): GraphSymbolReference[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare("SELECT * FROM graph_symbol_references WHERE symbol_id = ? ORDER BY line ASC, col ASC")
      .all(symbolId) as RawGraphReference[];
    return rows.map(toReference);
  }

  replaceCallsForNode(nodeId: string, calls: Array<Omit<GraphCall, "id">>): GraphCall[] {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      DELETE FROM graph_calls
      WHERE caller_symbol_id IN (
        SELECT id FROM graph_symbols WHERE node_id = ?
      )
    `).run(nodeId);
    const insert = database.prepare(`
      INSERT INTO graph_calls (id, caller_symbol_id, callee_name, callee_node_id, callee_symbol_id, line)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const call of calls) {
      insert.run(
        createId("gcall"),
        call.callerSymbolId,
        call.calleeName,
        call.calleeNodeId ?? null,
        call.calleeSymbolId ?? null,
        call.line,
      );
    }
    return this.findCallsByNode(nodeId);
  }

  findCallsByNode(nodeId: string): GraphCall[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT gc.*
      FROM graph_calls gc
      JOIN graph_symbols gs ON gs.id = gc.caller_symbol_id
      WHERE gs.node_id = ?
      ORDER BY gc.line ASC
    `).all(nodeId) as RawGraphCall[];
    return rows.map(toCall);
  }

  findCallers(symbolId: string): GraphCall[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare("SELECT * FROM graph_calls WHERE callee_symbol_id = ? ORDER BY line ASC")
      .all(symbolId) as RawGraphCall[];
    return rows.map(toCall);
  }

  findCallees(symbolId: string): GraphCall[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare("SELECT * FROM graph_calls WHERE caller_symbol_id = ? ORDER BY line ASC")
      .all(symbolId) as RawGraphCall[];
    return rows.map(toCall);
  }

  replaceAllForNode(input: ReplaceGraphNodeDataInput): {
    edges: GraphEdge[];
    symbols: GraphSymbol[];
    references: GraphSymbolReference[];
    calls: GraphCall[];
  } {
    const database = openDhDatabase(this.repoRoot);
    database.exec("BEGIN");
    try {
      const edges = this.replaceEdgesForNode(input.nodeId, input.edges);
      const symbols = this.replaceSymbolsForNode(input.nodeId, input.symbols);
      const symbolByName = new Map(symbols.map((symbol) => [symbol.name, symbol.id]));
      const refs = this.replaceReferencesForNode(input.nodeId, input.references.map((ref) => {
        const symbolId = ref.symbolId.startsWith("temp:")
          ? (symbolByName.get(ref.symbolId.slice(5)) ?? ref.symbolId)
          : ref.symbolId;
        return { ...ref, symbolId };
      }));
      const calls = this.replaceCallsForNode(input.nodeId, input.calls.map((call) => {
        const callerSymbolId = call.callerSymbolId.startsWith("temp:")
          ? (symbolByName.get(call.callerSymbolId.slice(5)) ?? call.callerSymbolId)
          : call.callerSymbolId;
        const calleeSymbolId = call.calleeSymbolId?.startsWith("temp:")
          ? (symbolByName.get(call.calleeSymbolId.slice(5)) ?? call.calleeSymbolId)
          : (call.calleeSymbolId ?? null);
        return { ...call, callerSymbolId, calleeSymbolId };
      }));
      database.exec("COMMIT");
      return { edges, symbols, references: refs, calls };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
