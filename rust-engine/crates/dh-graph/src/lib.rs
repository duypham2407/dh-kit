//! Graph projection and bounded traversal over stored facts.

use dh_storage::{Database, FileRepository, GraphRepository, SymbolRepository, GraphEdgeRepository};
pub use dh_types::{
    CallKind, ChunkId, EdgeConfidence, EdgeKind, EdgeResolution, FileId, GraphEdge,
    GraphNeighborhood, GraphNeighbors, GraphNode, GraphPath, ImportKind, NodeId, NodeKind, Span,
    SymbolId, WorkspaceId,
};
use std::collections::{HashMap, HashSet, VecDeque};



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
        let (node_type, node_id) = match from {
            NodeId::File(id) => ("file", *id as i64),
            NodeId::Symbol(id) => ("symbol", *id as i64),
            NodeId::Chunk(_) => return Ok(vec![]),
        };
        
        let db_edges = self.find_outgoing_edges(workspace_id, node_type, node_id, limit)?;
        edges.extend(db_edges);
        
        if let NodeId::File(file_id) = from {
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
                    break;
                }
            }
        } else if let NodeId::Symbol(symbol_id) = from {
            if let Some(symbol) = GraphRepository::find_symbol_by_id(self, workspace_id, *symbol_id)? {
                edges.push(GraphEdge {
                    kind: EdgeKind::Definition,
                    from: NodeId::Symbol(symbol.id),
                    to: NodeId::File(symbol.file_id),
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    span: Some(symbol.span),
                    reason: format!("defined in file {}", symbol.file_id),
                });
            }
        }
        
        edges.truncate(limit);
        Ok(edges)
    }

    fn graph_incoming_edges(
        &self,
        workspace_id: WorkspaceId,
        to: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>> {
        let mut edges = Vec::new();
        let (node_type, node_id) = match to {
            NodeId::File(id) => ("file", *id as i64),
            NodeId::Symbol(id) => ("symbol", *id as i64),
            NodeId::Chunk(_) => return Ok(vec![]),
        };
        
        let db_edges = self.find_incoming_edges(workspace_id, node_type, node_id, limit)?;
        edges.extend(db_edges);
        
        if let NodeId::File(file_id) = to {
            for symbol in self.find_symbols_by_file(*file_id)? {
                edges.push(GraphEdge {
                    kind: EdgeKind::Definition,
                    from: NodeId::Symbol(symbol.id),
                    to: NodeId::File(*file_id),
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    span: Some(symbol.span),
                    reason: format!("defined in file {}", file_id),
                });
                if edges.len() >= limit {
                    break;
                }
            }
        } else if let NodeId::Symbol(symbol_id) = to {
            if let Some(symbol) = GraphRepository::find_symbol_by_id(self, workspace_id, *symbol_id)? {
                edges.push(GraphEdge {
                    kind: EdgeKind::Contains,
                    from: NodeId::File(symbol.file_id),
                    to: NodeId::Symbol(symbol.id),
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    span: Some(symbol.span),
                    reason: format!("file contains symbol {}", symbol.name),
                });
            }
        }
        
        edges.truncate(limit);
        Ok(edges)
    }
}

#[cfg(test)]
mod tests {
    use super::{GraphProjectionRepository, GraphService, NodeId};
    use dh_storage::{
        GraphEdgeRepository, ChunkRepository, Database, FileRepository, SymbolRepository,
    };
    use dh_types::{
        CallEdge, CallKind, Chunk, ChunkKind, EmbeddingStatus, File, FreshnessReason,
        FreshnessState, Import, ImportKind, LanguageId, ParseStatus, Reference, ReferenceKind,
        Span, Symbol, SymbolKind, Visibility,
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
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-graph-1".into()),
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
            freshness_state: FreshnessState::RefreshedCurrent,
            freshness_reason: Some(FreshnessReason::ContentChanged),
            last_freshness_run_id: Some("run-graph-2".into()),
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

        db.insert_edges(&[
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Imports,
                from: dh_types::NodeId::File(1),
                to: dh_types::NodeId::Symbol(20),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 10,
                    start_line: 1,
                    start_column: 0,
                    end_line: 1,
                    end_column: 10,
                }),
                reason: "./b".into(),
            },
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::References,
                from: dh_types::NodeId::Symbol(10),
                to: dh_types::NodeId::Symbol(20),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 3,
                    start_line: 2,
                    start_column: 2,
                    end_line: 2,
                    end_column: 5,
                }),
                reason: "b".into(),
            },
            dh_types::GraphEdge {
                kind: dh_types::EdgeKind::Calls,
                from: dh_types::NodeId::Symbol(10),
                to: dh_types::NodeId::Symbol(20),
                resolution: dh_types::EdgeResolution::Resolved,
                confidence: dh_types::EdgeConfidence::Direct,
                span: Some(Span {
                    start_byte: 0,
                    end_byte: 1,
                    start_line: 2,
                    start_column: 2,
                    end_line: 2,
                    end_column: 3,
                }),
                reason: "b".into(),
            }
        ], 1)?;

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
