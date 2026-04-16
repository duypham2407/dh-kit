//! Graph projection and bounded traversal over stored facts.

use dh_storage::{Database, FileRepository, GraphRepository, ImportRepository, SymbolRepository};
use dh_types::{CallKind, ChunkId, FileId, ImportKind, Span, SymbolId, WorkspaceId};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    File,
    Symbol,
    Chunk,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum NodeId {
    File(FileId),
    Symbol(SymbolId),
    Chunk(ChunkId),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Contains,
    Definition,
    Imports,
    ReExports,
    References,
    Calls,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeResolution {
    Resolved,
    Unresolved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeConfidence {
    Direct,
    BestEffort,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: NodeId,
    pub kind: NodeKind,
    pub label: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub kind: EdgeKind,
    pub from: NodeId,
    pub to: NodeId,
    pub resolution: EdgeResolution,
    pub confidence: EdgeConfidence,
    pub span: Option<Span>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNeighbors {
    pub subject: NodeId,
    pub outgoing: Vec<GraphEdge>,
    pub incoming: Vec<GraphEdge>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphPath {
    pub start: NodeId,
    pub end: NodeId,
    pub edges: Vec<GraphEdge>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNeighborhood {
    pub center: NodeId,
    pub nodes: Vec<NodeId>,
    pub edges: Vec<GraphEdge>,
    pub hops: u32,
    pub node_limit: usize,
    pub truncated: bool,
}

pub trait GraphService {
    fn neighbors(
        &self,
        workspace_id: WorkspaceId,
        node: &NodeId,
        limit: usize,
    ) -> anyhow::Result<GraphNeighbors>;
    fn shortest_path(
        &self,
        workspace_id: WorkspaceId,
        start: &NodeId,
        end: &NodeId,
        max_hops: u32,
    ) -> anyhow::Result<Option<GraphPath>>;
    fn neighborhood(
        &self,
        workspace_id: WorkspaceId,
        center: &NodeId,
        max_hops: u32,
        node_limit: usize,
    ) -> anyhow::Result<GraphNeighborhood>;
    fn node(&self, workspace_id: WorkspaceId, node: &NodeId) -> anyhow::Result<Option<GraphNode>>;
}

impl GraphService for Database {
    fn neighbors(
        &self,
        workspace_id: WorkspaceId,
        node: &NodeId,
        limit: usize,
    ) -> anyhow::Result<GraphNeighbors> {
        let outgoing = self.graph_outgoing_edges(workspace_id, node, limit)?;
        let incoming = self.graph_incoming_edges(workspace_id, node, limit)?;
        Ok(GraphNeighbors {
            subject: node.clone(),
            truncated: outgoing.len() >= limit || incoming.len() >= limit,
            outgoing,
            incoming,
        })
    }

    fn shortest_path(
        &self,
        workspace_id: WorkspaceId,
        start: &NodeId,
        end: &NodeId,
        max_hops: u32,
    ) -> anyhow::Result<Option<GraphPath>> {
        if start == end {
            return Ok(Some(GraphPath {
                start: start.clone(),
                end: end.clone(),
                edges: Vec::new(),
                truncated: false,
            }));
        }

        let mut visited: HashSet<NodeId> = HashSet::new();
        let mut queue: VecDeque<(NodeId, Vec<GraphEdge>)> = VecDeque::new();

        visited.insert(start.clone());
        queue.push_back((start.clone(), Vec::new()));

        while let Some((current, path)) = queue.pop_front() {
            if path.len() as u32 >= max_hops {
                continue;
            }

            for edge in self.graph_outgoing_edges(workspace_id, &current, 256)? {
                let next = edge.to.clone();
                if visited.contains(&next) {
                    continue;
                }

                let mut next_path = path.clone();
                next_path.push(edge.clone());

                if &next == end {
                    return Ok(Some(GraphPath {
                        start: start.clone(),
                        end: end.clone(),
                        edges: next_path,
                        truncated: false,
                    }));
                }

                visited.insert(next.clone());
                queue.push_back((next, next_path));
            }
        }

        Ok(None)
    }

    fn neighborhood(
        &self,
        workspace_id: WorkspaceId,
        center: &NodeId,
        max_hops: u32,
        node_limit: usize,
    ) -> anyhow::Result<GraphNeighborhood> {
        let mut visited: HashSet<NodeId> = HashSet::new();
        let mut queue: VecDeque<(NodeId, u32)> = VecDeque::new();
        let mut edges = Vec::new();
        let mut seen_edges: HashSet<(NodeId, NodeId, EdgeKind)> = HashSet::new();
        let mut truncated = false;

        visited.insert(center.clone());
        queue.push_back((center.clone(), 0));

        while let Some((node, hop)) = queue.pop_front() {
            if visited.len() >= node_limit {
                truncated = true;
                break;
            }

            let neighbors = self.graph_outgoing_edges(workspace_id, &node, 256)?;
            for edge in neighbors {
                let key = (edge.from.clone(), edge.to.clone(), edge.kind);
                if seen_edges.insert(key) {
                    edges.push(edge.clone());
                }

                let next = edge.to;
                if visited.contains(&next) {
                    continue;
                }

                if visited.len() >= node_limit {
                    truncated = true;
                    continue;
                }

                visited.insert(next.clone());
                if hop + 1 < max_hops {
                    queue.push_back((next, hop + 1));
                } else if hop + 1 == max_hops {
                    truncated = true;
                }
            }
        }

        Ok(GraphNeighborhood {
            center: center.clone(),
            nodes: visited.into_iter().collect(),
            edges,
            hops: max_hops,
            node_limit,
            truncated,
        })
    }

    fn node(&self, workspace_id: WorkspaceId, node: &NodeId) -> anyhow::Result<Option<GraphNode>> {
        match node {
            NodeId::File(file_id) => {
                let files = self.list_files_by_workspace(workspace_id)?;
                Ok(files
                    .into_iter()
                    .find(|f| &f.id == file_id)
                    .map(|f| GraphNode {
                        id: NodeId::File(f.id),
                        kind: NodeKind::File,
                        label: f.rel_path.clone(),
                        file_path: Some(f.rel_path),
                    }))
            }
            NodeId::Symbol(symbol_id) => {
                let symbol = GraphRepository::find_symbol_by_id(self, workspace_id, *symbol_id)?;
                if let Some(s) = symbol {
                    let file_path =
                        GraphRepository::find_file_by_id(self, workspace_id, s.file_id)?
                            .map(|f| f.rel_path);
                    Ok(Some(GraphNode {
                        id: NodeId::Symbol(s.id),
                        kind: NodeKind::Symbol,
                        label: if s.qualified_name.is_empty() {
                            s.name
                        } else {
                            s.qualified_name
                        },
                        file_path,
                    }))
                } else {
                    Ok(None)
                }
            }
            NodeId::Chunk(chunk_id) => {
                let chunk = GraphRepository::find_chunk_by_id(self, workspace_id, *chunk_id)?;
                if let Some(c) = chunk {
                    let file_path =
                        GraphRepository::find_file_by_id(self, workspace_id, c.file_id)?
                            .map(|f| f.rel_path);
                    Ok(Some(GraphNode {
                        id: NodeId::Chunk(c.id),
                        kind: NodeKind::Chunk,
                        label: c.title,
                        file_path,
                    }))
                } else {
                    Ok(None)
                }
            }
        }
    }
}

pub trait GraphProjectionRepository {
    fn graph_outgoing_edges(
        &self,
        workspace_id: WorkspaceId,
        from: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>>;
    fn graph_incoming_edges(
        &self,
        workspace_id: WorkspaceId,
        to: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>>;
}

impl GraphProjectionRepository for Database {
    fn graph_outgoing_edges(
        &self,
        workspace_id: WorkspaceId,
        from: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>> {
        let mut edges = Vec::new();
        let files = self.list_files_by_workspace(workspace_id)?;
        let file_by_id: HashMap<FileId, String> =
            files.into_iter().map(|f| (f.id, f.rel_path)).collect();

        match from {
            NodeId::File(file_id) => {
                for symbol in self.find_symbols_by_file(*file_id)? {
                    edges.push(GraphEdge {
                        kind: EdgeKind::Contains,
                        from: NodeId::File(*file_id),
                        to: NodeId::Symbol(symbol.id),
                        resolution: EdgeResolution::Resolved,
                        confidence: EdgeConfidence::Direct,
                        span: Some(symbol.span),
                        reason: format!("file contains symbol {}", symbol.name),
                    });
                    if edges.len() >= limit {
                        return Ok(edges);
                    }
                }

                for imp in self.find_imports_by_file(*file_id)? {
                    let kind = if imp.is_reexport {
                        EdgeKind::ReExports
                    } else {
                        EdgeKind::Imports
                    };
                    let (to_node, resolution) = if let Some(target_symbol) = imp.resolved_symbol_id
                    {
                        (NodeId::Symbol(target_symbol), EdgeResolution::Resolved)
                    } else if let Some(target_file) = imp.resolved_file_id {
                        (NodeId::File(target_file), EdgeResolution::Resolved)
                    } else {
                        (NodeId::File(*file_id), EdgeResolution::Unresolved)
                    };

                    edges.push(GraphEdge {
                        kind,
                        from: NodeId::File(*file_id),
                        to: to_node,
                        resolution,
                        confidence: import_confidence(imp.kind),
                        span: Some(imp.span),
                        reason: format!(
                            "{} {}",
                            if imp.is_reexport {
                                "re-export"
                            } else {
                                "import"
                            },
                            imp.raw_specifier
                        ),
                    });
                    if edges.len() >= limit {
                        return Ok(edges);
                    }
                }
            }
            NodeId::Symbol(symbol_id) => {
                for r in self.find_references_to_symbol(workspace_id, *symbol_id, limit)? {
                    let source = r
                        .source_symbol_id
                        .map(NodeId::Symbol)
                        .unwrap_or(NodeId::File(r.source_file_id));
                    edges.push(GraphEdge {
                        kind: EdgeKind::References,
                        from: source,
                        to: NodeId::Symbol(*symbol_id),
                        resolution: if r.resolved {
                            EdgeResolution::Resolved
                        } else {
                            EdgeResolution::Unresolved
                        },
                        confidence: if r.resolved {
                            EdgeConfidence::Direct
                        } else {
                            EdgeConfidence::BestEffort
                        },
                        span: Some(r.span),
                        reason: format!("reference {}", r.target_name),
                    });
                    if edges.len() >= limit {
                        return Ok(edges);
                    }
                }

                for call in self.find_calls_from_symbol(workspace_id, *symbol_id, limit)? {
                    let to = call
                        .callee_symbol_id
                        .map(NodeId::Symbol)
                        .unwrap_or_else(|| NodeId::File(call.source_file_id));
                    edges.push(GraphEdge {
                        kind: EdgeKind::Calls,
                        from: NodeId::Symbol(*symbol_id),
                        to,
                        resolution: if call.resolved {
                            EdgeResolution::Resolved
                        } else {
                            EdgeResolution::Unresolved
                        },
                        confidence: call_confidence(call.kind),
                        span: Some(call.span),
                        reason: format!("calls {}", call.callee_display_name),
                    });
                    if edges.len() >= limit {
                        return Ok(edges);
                    }
                }

                if let Some(symbol) =
                    GraphRepository::find_symbol_by_id(self, workspace_id, *symbol_id)?
                {
                    edges.push(GraphEdge {
                        kind: EdgeKind::Definition,
                        from: NodeId::Symbol(symbol.id),
                        to: NodeId::File(symbol.file_id),
                        resolution: EdgeResolution::Resolved,
                        confidence: EdgeConfidence::Direct,
                        span: Some(symbol.span),
                        reason: format!(
                            "defined in {}",
                            file_by_id
                                .get(&symbol.file_id)
                                .cloned()
                                .unwrap_or_else(|| "<unknown>".to_string())
                        ),
                    });
                }
            }
            NodeId::Chunk(_) => {}
        }

        Ok(edges)
    }

    fn graph_incoming_edges(
        &self,
        workspace_id: WorkspaceId,
        to: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>> {
        let mut edges = Vec::new();
        match to {
            NodeId::File(file_id) => {
                for imp in self.find_reverse_imports_by_file(workspace_id, *file_id, limit)? {
                    edges.push(GraphEdge {
                        kind: if imp.is_reexport {
                            EdgeKind::ReExports
                        } else {
                            EdgeKind::Imports
                        },
                        from: NodeId::File(imp.source_file_id),
                        to: NodeId::File(*file_id),
                        resolution: EdgeResolution::Resolved,
                        confidence: import_confidence(imp.kind),
                        span: Some(imp.span),
                        reason: format!("imported by {}", imp.source_file_id),
                    });
                    if edges.len() >= limit {
                        break;
                    }
                }
            }
            NodeId::Symbol(symbol_id) => {
                for r in self.find_references_to_symbol(workspace_id, *symbol_id, limit)? {
                    edges.push(GraphEdge {
                        kind: EdgeKind::References,
                        from: r
                            .source_symbol_id
                            .map(NodeId::Symbol)
                            .unwrap_or(NodeId::File(r.source_file_id)),
                        to: NodeId::Symbol(*symbol_id),
                        resolution: if r.resolved {
                            EdgeResolution::Resolved
                        } else {
                            EdgeResolution::Unresolved
                        },
                        confidence: if r.resolved {
                            EdgeConfidence::Direct
                        } else {
                            EdgeConfidence::BestEffort
                        },
                        span: Some(r.span),
                        reason: format!("reference {}", r.target_name),
                    });
                    if edges.len() >= limit {
                        break;
                    }
                }
            }
            NodeId::Chunk(_) => {}
        }

        Ok(edges)
    }
}

fn import_confidence(kind: ImportKind) -> EdgeConfidence {
    match kind {
        ImportKind::Dynamic | ImportKind::ConditionalRequire => EdgeConfidence::BestEffort,
        _ => EdgeConfidence::Direct,
    }
}

fn call_confidence(kind: CallKind) -> EdgeConfidence {
    match kind {
        CallKind::Dynamic => EdgeConfidence::BestEffort,
        _ => EdgeConfidence::Direct,
    }
}

#[cfg(test)]
mod tests {
    use super::{GraphProjectionRepository, GraphService, NodeId};
    use dh_storage::{
        CallEdgeRepository, ChunkRepository, Database, FileRepository, ImportRepository,
        ReferenceRepository, SymbolRepository,
    };
    use dh_types::{
        CallEdge, CallKind, Chunk, ChunkKind, EmbeddingStatus, File, Import, ImportKind,
        LanguageId, ParseStatus, Reference, ReferenceKind, Span, Symbol, SymbolKind, Visibility,
    };
    use tempfile::NamedTempFile;

    fn setup_db() -> anyhow::Result<Database> {
        let temp = NamedTempFile::new()?;
        let db = Database::new(temp.path())?;
        db.initialize()?;
        db.connection().execute(
            "INSERT INTO workspaces(id, root_path, created_at, updated_at) VALUES (1, '/tmp/ws', 0, 0)",
            [],
        )?;
        db.connection().execute(
            "INSERT INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES (1, 1, '/tmp/ws', 'git_root', NULL)",
            [],
        )?;
        Ok(db)
    }

    fn seed(db: &Database) -> anyhow::Result<()> {
        db.upsert_file(&File {
            id: 1,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/a.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 10,
            mtime_unix_ms: 1,
            content_hash: "a".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 1,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
        })?;
        db.upsert_file(&File {
            id: 2,
            workspace_id: 1,
            root_id: 1,
            package_id: None,
            rel_path: "src/b.ts".into(),
            language: LanguageId::TypeScript,
            size_bytes: 10,
            mtime_unix_ms: 1,
            content_hash: "b".into(),
            structure_hash: None,
            public_api_hash: None,
            parse_status: ParseStatus::Parsed,
            parse_error: None,
            symbol_count: 1,
            chunk_count: 0,
            is_barrel: false,
            last_indexed_at_unix_ms: None,
            deleted_at_unix_ms: None,
        })?;

        db.insert_symbols(&[
            Symbol {
                id: 10,
                workspace_id: 1,
                file_id: 1,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "a".into(),
                qualified_name: "a".into(),
                signature: None,
                detail: None,
                visibility: Visibility::Public,
                exported: true,
                async_flag: false,
                static_flag: false,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                },
                symbol_hash: "s10".into(),
            },
            Symbol {
                id: 20,
                workspace_id: 1,
                file_id: 2,
                parent_symbol_id: None,
                kind: SymbolKind::Function,
                name: "b".into(),
                qualified_name: "b".into(),
                signature: None,
                detail: None,
                visibility: Visibility::Public,
                exported: true,
                async_flag: false,
                static_flag: false,
                span: Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 1,
                },
                symbol_hash: "s20".into(),
            },
        ])?;

        db.insert_imports(&[Import {
            id: 100,
            workspace_id: 1,
            source_file_id: 1,
            source_symbol_id: None,
            raw_specifier: "./b".into(),
            imported_name: Some("b".into()),
            local_name: Some("b".into()),
            alias: None,
            kind: ImportKind::EsmNamed,
            is_type_only: false,
            is_reexport: false,
            resolved_file_id: Some(2),
            resolved_symbol_id: Some(20),
            span: Span {
                start_byte: 0,
                end_byte: 10,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 10,
            },
            resolution_error: None,
        }])?;

        db.insert_references(&[Reference {
            id: 200,
            workspace_id: 1,
            source_file_id: 1,
            source_symbol_id: Some(10),
            target_symbol_id: Some(20),
            target_name: "b".into(),
            kind: ReferenceKind::Call,
            resolved: true,
            resolution_confidence: 1.0,
            span: Span {
                start_byte: 0,
                end_byte: 3,
                start_line: 2,
                start_column: 2,
                end_line: 2,
                end_column: 5,
            },
        }])?;

        db.insert_call_edges(&[CallEdge {
            id: 300,
            workspace_id: 1,
            source_file_id: 1,
            caller_symbol_id: Some(10),
            callee_symbol_id: Some(20),
            callee_qualified_name: Some("b".into()),
            callee_display_name: "b".into(),
            kind: CallKind::Direct,
            resolved: true,
            span: Span {
                start_byte: 0,
                end_byte: 1,
                start_line: 2,
                start_column: 2,
                end_line: 2,
                end_column: 3,
            },
        }])?;

        db.insert_chunks(&[Chunk {
            id: 400,
            workspace_id: 1,
            file_id: 1,
            symbol_id: Some(10),
            parent_symbol_id: None,
            kind: ChunkKind::Symbol,
            language: LanguageId::TypeScript,
            title: "a".into(),
            content: "export function a(){ return b(); }".into(),
            content_hash: "chunk".into(),
            token_estimate: 8,
            span: Span {
                start_byte: 0,
                end_byte: 30,
                start_line: 1,
                start_column: 0,
                end_line: 1,
                end_column: 30,
            },
            prev_chunk_id: None,
            next_chunk_id: None,
            embedding_status: EmbeddingStatus::NotQueued,
        }])?;

        Ok(())
    }

    #[test]
    fn graph_projection_exposes_edges() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;
        let outgoing = db.graph_outgoing_edges(1, &NodeId::File(1), 20)?;
        assert!(outgoing
            .iter()
            .any(|e| matches!(e.kind, super::EdgeKind::Contains)));
        assert!(outgoing
            .iter()
            .any(|e| matches!(e.kind, super::EdgeKind::Imports)));
        Ok(())
    }

    #[test]
    fn graph_shortest_path_finds_symbol_to_symbol_call_path() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;
        let maybe_path = db.shortest_path(1, &NodeId::Symbol(10), &NodeId::Symbol(20), 4)?;
        assert!(maybe_path.is_some());
        let path = maybe_path.expect("path exists");
        assert!(!path.edges.is_empty());
        Ok(())
    }

    #[test]
    fn graph_neighborhood_is_bounded() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;
        let n = db.neighborhood(1, &NodeId::Symbol(10), 1, 2)?;
        assert!(n.nodes.len() <= 2);
        Ok(())
    }
}
