//! Graph projection and bounded traversal over stored facts.

use dh_storage::{
    Database, FileRepository, GraphEdgeRepository, GraphRepository, IndexStateRepository,
    SymbolRepository,
};
pub use dh_types::{
    CallKind, ChunkId, EdgeConfidence, EdgeKind, EdgeResolution, File, FileId, FreshnessState,
    GraphEdge, GraphNeighborhood, GraphNeighbors, GraphNode, GraphPath, ImportKind, IndexRunStatus,
    NodeId, NodeKind, Span, Symbol, SymbolId, WorkspaceId,
};
use std::collections::{HashMap, HashSet, VecDeque};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GraphProjectionFreshness {
    Current,
    Cold,
    Stale,
    Partial,
}

impl GraphProjectionFreshness {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Current => "current",
            Self::Cold => "cold",
            Self::Stale => "stale",
            Self::Partial => "partial",
        }
    }

    #[must_use]
    pub fn is_current(self) -> bool {
        self == Self::Current
    }
}

#[derive(Debug, Clone)]
pub struct GraphHydrationStats {
    pub workspace_id: WorkspaceId,
    pub index_version: Option<u64>,
    pub duration_ms: u128,
    pub node_count: usize,
    pub persisted_edge_count: usize,
    pub synthetic_edge_count: usize,
    pub freshness: GraphProjectionFreshness,
    pub freshness_reason: String,
}

#[derive(Debug, Clone)]
pub struct HydratedGraphProjection {
    workspace_id: WorkspaceId,
    index_version: Option<u64>,
    hydrated_at_unix_ms: i64,
    freshness: GraphProjectionFreshness,
    freshness_reason: String,
    files_by_id: HashMap<FileId, File>,
    symbols_by_id: HashMap<SymbolId, Symbol>,
    outgoing: HashMap<NodeId, Vec<GraphEdge>>,
    incoming: HashMap<NodeId, Vec<GraphEdge>>,
    persisted_edge_count: usize,
    synthetic_edge_count: usize,
    hydration_ms: u128,
}

impl HydratedGraphProjection {
    pub fn hydrate(db: &Database, workspace_id: WorkspaceId) -> anyhow::Result<Self> {
        let started = Instant::now();
        let files = db.list_files_by_workspace(workspace_id)?;
        let symbols = db.find_symbols_by_workspace(workspace_id)?;
        let persisted_edges = db.find_edges_by_workspace(workspace_id)?;
        let state = db.get_state(workspace_id)?;
        let freshness_counts = db.freshness_state_counts(workspace_id)?;

        let index_version = state.as_ref().map(|state| state.index_version);
        let (freshness, freshness_reason) =
            classify_projection_freshness(state.as_ref(), freshness_counts, files.len());

        let mut files_by_id = HashMap::new();
        for file in files {
            if file.deleted_at_unix_ms.is_none() {
                files_by_id.insert(file.id, file);
            }
        }

        let mut symbols_by_id = HashMap::new();
        for symbol in symbols {
            symbols_by_id.insert(symbol.id, symbol);
        }

        let persisted_edge_count = persisted_edges.len();
        let mut outgoing: HashMap<NodeId, Vec<GraphEdge>> = HashMap::new();
        let mut incoming: HashMap<NodeId, Vec<GraphEdge>> = HashMap::new();
        for edge in persisted_edges {
            push_projection_edge(&mut outgoing, &mut incoming, edge);
        }

        let mut synthetic_edge_count = 0;
        for symbol in symbols_by_id.values() {
            if files_by_id.contains_key(&symbol.file_id) {
                push_projection_edge(
                    &mut outgoing,
                    &mut incoming,
                    GraphEdge {
                        kind: EdgeKind::Contains,
                        from: NodeId::File(symbol.file_id),
                        to: NodeId::Symbol(symbol.id),
                        resolution: EdgeResolution::Resolved,
                        confidence: EdgeConfidence::Direct,
                        span: Some(symbol.span),
                        reason: format!("file contains symbol {}", symbol.name),
                        payload_json: None,
                    },
                );
                synthetic_edge_count += 1;

                push_projection_edge(
                    &mut outgoing,
                    &mut incoming,
                    GraphEdge {
                        kind: EdgeKind::Definition,
                        from: NodeId::Symbol(symbol.id),
                        to: NodeId::File(symbol.file_id),
                        resolution: EdgeResolution::Resolved,
                        confidence: EdgeConfidence::Direct,
                        span: Some(symbol.span),
                        reason: format!("defined in file {}", symbol.file_id),
                        payload_json: None,
                    },
                );
                synthetic_edge_count += 1;
            }
        }

        Ok(Self {
            workspace_id,
            index_version,
            hydrated_at_unix_ms: current_unix_ms(),
            freshness,
            freshness_reason,
            files_by_id,
            symbols_by_id,
            outgoing,
            incoming,
            persisted_edge_count,
            synthetic_edge_count,
            hydration_ms: started.elapsed().as_millis(),
        })
    }

    #[must_use]
    pub fn workspace_id(&self) -> WorkspaceId {
        self.workspace_id
    }

    #[must_use]
    pub fn index_version(&self) -> Option<u64> {
        self.index_version
    }

    #[must_use]
    pub fn hydrated_at_unix_ms(&self) -> i64 {
        self.hydrated_at_unix_ms
    }

    #[must_use]
    pub fn freshness(&self) -> GraphProjectionFreshness {
        self.freshness
    }

    #[must_use]
    pub fn freshness_reason(&self) -> &str {
        &self.freshness_reason
    }

    #[must_use]
    pub fn is_current(&self) -> bool {
        self.freshness.is_current()
    }

    #[must_use]
    pub fn stats(&self) -> GraphHydrationStats {
        GraphHydrationStats {
            workspace_id: self.workspace_id,
            index_version: self.index_version,
            duration_ms: self.hydration_ms,
            node_count: self.files_by_id.len() + self.symbols_by_id.len(),
            persisted_edge_count: self.persisted_edge_count,
            synthetic_edge_count: self.synthetic_edge_count,
            freshness: self.freshness,
            freshness_reason: self.freshness_reason.clone(),
        }
    }

    #[must_use]
    pub fn outgoing_edges(&self, from: &NodeId, limit: usize) -> Vec<GraphEdge> {
        bounded_edges(self.outgoing.get(from), limit)
    }

    #[must_use]
    pub fn incoming_edges(&self, to: &NodeId, limit: usize) -> Vec<GraphEdge> {
        bounded_edges(self.incoming.get(to), limit)
    }

    fn node_from_projection(&self, node: &NodeId) -> Option<GraphNode> {
        match node {
            NodeId::File(file_id) => self.files_by_id.get(file_id).map(|file| GraphNode {
                id: NodeId::File(file.id),
                kind: NodeKind::File,
                label: file.rel_path.clone(),
                file_path: Some(file.rel_path.clone()),
            }),
            NodeId::Symbol(symbol_id) => self.symbols_by_id.get(symbol_id).map(|symbol| {
                let file_path = self
                    .files_by_id
                    .get(&symbol.file_id)
                    .map(|file| file.rel_path.clone());
                GraphNode {
                    id: NodeId::Symbol(symbol.id),
                    kind: NodeKind::Symbol,
                    label: if symbol.qualified_name.is_empty() {
                        symbol.name.clone()
                    } else {
                        symbol.qualified_name.clone()
                    },
                    file_path,
                }
            }),
            NodeId::Chunk(_) => None,
        }
    }

    fn call_hierarchy_direction(
        &self,
        seed: &NodeId,
        incoming: bool,
        max_depth: u32,
        limit: usize,
    ) -> Vec<dh_types::CallHierarchyNode> {
        let mut visited: HashSet<NodeId> = HashSet::new();
        let mut queue: VecDeque<(NodeId, u32)> = VecDeque::new();
        let mut out = Vec::new();

        visited.insert(seed.clone());
        queue.push_back((seed.clone(), 0));

        while let Some((node, depth)) = queue.pop_front() {
            if depth >= max_depth || out.len() >= limit {
                continue;
            }

            let edges = if incoming {
                self.incoming_edges(&node, limit.saturating_mul(4).max(16))
            } else {
                self.outgoing_edges(&node, limit.saturating_mul(4).max(16))
            };

            for edge in edges {
                if !matches!(edge.kind, EdgeKind::Calls) {
                    continue;
                }
                let next = if incoming { edge.from } else { edge.to };
                if !visited.insert(next.clone()) {
                    continue;
                }
                let next_depth = depth.saturating_add(1);
                if let Some(graph_node) = self.node_from_projection(&next) {
                    out.push(dh_types::CallHierarchyNode {
                        node: graph_node,
                        call_depth: next_depth,
                        entry_point: None,
                    });
                    if out.len() >= limit {
                        break;
                    }
                }
                if next_depth < max_depth {
                    queue.push_back((next, next_depth));
                }
            }
        }

        out
    }
}

impl GraphService for HydratedGraphProjection {
    fn neighbors(
        &self,
        workspace_id: WorkspaceId,
        node: &NodeId,
        limit: usize,
    ) -> anyhow::Result<GraphNeighbors> {
        if workspace_id != self.workspace_id {
            return Ok(GraphNeighbors {
                subject: node.clone(),
                outgoing: Vec::new(),
                incoming: Vec::new(),
                truncated: false,
            });
        }

        let outgoing = self.outgoing_edges(node, limit);
        let incoming = self.incoming_edges(node, limit);
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
        if workspace_id != self.workspace_id {
            return Ok(None);
        }
        if start == end {
            return Ok(Some(GraphPath {
                start: start.clone(),
                end: end.clone(),
                edges: Vec::new(),
                truncated: false,
            }));
        }

        let mut visited: HashSet<NodeId> = HashSet::new();
        let mut queue: VecDeque<(NodeId, Vec<GraphEdge>, u32)> = VecDeque::new();
        visited.insert(start.clone());
        queue.push_back((start.clone(), Vec::new(), 0));

        while let Some((node, path, depth)) = queue.pop_front() {
            if depth >= max_hops {
                continue;
            }

            for edge in self.outgoing_edges(&node, 1024) {
                let next = edge.to.clone();
                if !visited.insert(next.clone()) {
                    continue;
                }
                let mut next_path = path.clone();
                next_path.push(edge);
                if &next == end {
                    return Ok(Some(GraphPath {
                        start: start.clone(),
                        end: end.clone(),
                        edges: next_path,
                        truncated: false,
                    }));
                }
                queue.push_back((next, next_path, depth.saturating_add(1)));
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
        if workspace_id != self.workspace_id {
            return Ok(GraphNeighborhood {
                center: center.clone(),
                nodes: Vec::new(),
                edges: Vec::new(),
                hops: max_hops,
                node_limit,
                truncated: false,
            });
        }

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

            for edge in self.outgoing_edges(&node, 256) {
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
        if workspace_id != self.workspace_id {
            return Ok(None);
        }
        Ok(self.node_from_projection(node))
    }

    fn weighted_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed: &NodeId,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> anyhow::Result<Vec<(NodeId, u32)>> {
        if workspace_id != self.workspace_id {
            return Ok(Vec::new());
        }

        let mut visited: HashMap<NodeId, u32> = HashMap::new();
        let mut queue: VecDeque<(NodeId, u32)> = VecDeque::new();
        visited.insert(seed.clone(), 0);
        queue.push_back((seed.clone(), 0));

        while let Some((node, depth)) = queue.pop_front() {
            if depth >= max_hops || visited.len() >= node_limit {
                continue;
            }
            for edge in self.outgoing_edges(&node, 256) {
                if !edge_kind_allowed(edge.kind, edge_kind_filter) {
                    continue;
                }
                let next = edge.to;
                if visited.contains_key(&next) {
                    continue;
                }
                let next_depth = depth.saturating_add(1);
                visited.insert(next.clone(), next_depth);
                if visited.len() >= node_limit {
                    break;
                }
                queue.push_back((next, next_depth));
            }
        }

        let mut result = visited.into_iter().collect::<Vec<_>>();
        result.sort_by_key(|(_, depth)| *depth);
        Ok(result)
    }

    fn find_callers(
        &self,
        workspace_id: WorkspaceId,
        callee: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>> {
        if workspace_id != self.workspace_id {
            return Ok(Vec::new());
        }
        Ok(self.call_hierarchy_direction(callee, true, max_depth, 1000))
    }

    fn find_callees(
        &self,
        workspace_id: WorkspaceId,
        caller: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>> {
        if workspace_id != self.workspace_id {
            return Ok(Vec::new());
        }
        Ok(self.call_hierarchy_direction(caller, false, max_depth, 1000))
    }

    fn find_entry_points(
        &self,
        workspace_id: WorkspaceId,
        node: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>> {
        if workspace_id != self.workspace_id {
            return Ok(Vec::new());
        }

        let callers = self.find_callers(workspace_id, node, max_depth)?;
        let mut entry_points = Vec::new();
        for mut caller in callers {
            let is_api = caller
                .node
                .file_path
                .as_ref()
                .is_some_and(|path| path.contains("api/") || path.contains("routes/"));
            let is_cli =
                caller.node.label.starts_with("cli_") || caller.node.label.ends_with("_cmd");
            let is_handler = caller.node.label.ends_with("_handler");

            if is_api {
                caller.entry_point = Some(dh_types::EntryPointKind::ApiRoute);
                entry_points.push(caller);
            } else if is_cli {
                caller.entry_point = Some(dh_types::EntryPointKind::CliCommand);
                entry_points.push(caller);
            } else if is_handler {
                caller.entry_point = Some(dh_types::EntryPointKind::EventHandler);
                entry_points.push(caller);
            }
        }

        Ok(entry_points)
    }
}

impl GraphProjectionRepository for HydratedGraphProjection {
    fn graph_outgoing_edges(
        &self,
        workspace_id: WorkspaceId,
        from: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>> {
        if workspace_id != self.workspace_id {
            return Ok(Vec::new());
        }
        Ok(self.outgoing_edges(from, limit))
    }

    fn graph_incoming_edges(
        &self,
        workspace_id: WorkspaceId,
        to: &NodeId,
        limit: usize,
    ) -> anyhow::Result<Vec<GraphEdge>> {
        if workspace_id != self.workspace_id {
            return Ok(Vec::new());
        }
        Ok(self.incoming_edges(to, limit))
    }
}

fn push_projection_edge(
    outgoing: &mut HashMap<NodeId, Vec<GraphEdge>>,
    incoming: &mut HashMap<NodeId, Vec<GraphEdge>>,
    edge: GraphEdge,
) {
    outgoing
        .entry(edge.from.clone())
        .or_default()
        .push(edge.clone());
    incoming.entry(edge.to.clone()).or_default().push(edge);
}

fn bounded_edges(edges: Option<&Vec<GraphEdge>>, limit: usize) -> Vec<GraphEdge> {
    edges
        .map(|edges| edges.iter().take(limit).cloned().collect())
        .unwrap_or_default()
}

fn classify_projection_freshness(
    state: Option<&dh_types::IndexState>,
    counts: dh_storage::FreshnessStateCounts,
    file_count: usize,
) -> (GraphProjectionFreshness, String) {
    if file_count == 0 {
        return (
            GraphProjectionFreshness::Cold,
            "no indexed files are available for graph projection".into(),
        );
    }

    let Some(state) = state else {
        return (
            GraphProjectionFreshness::Cold,
            "index_state is absent; graph projection was hydrated from storage without run metadata".into(),
        );
    };

    if state.active_run_id.is_some() || state.status != IndexRunStatus::Completed {
        return (
            GraphProjectionFreshness::Stale,
            format!(
                "index run is not complete (status={:?}, active_run_id={:?})",
                state.status, state.active_run_id
            ),
        );
    }

    if counts.not_current > 0 {
        return (
            GraphProjectionFreshness::Stale,
            format!(
                "{count} indexed file(s) are not current",
                count = counts.not_current
            ),
        );
    }

    if counts.degraded_partial > 0 {
        return (
            GraphProjectionFreshness::Partial,
            format!(
                "{count} indexed file(s) have degraded partial freshness",
                count = counts.degraded_partial
            ),
        );
    }

    (
        GraphProjectionFreshness::Current,
        format!(
            "index_version {} is complete and current",
            state.index_version
        ),
    )
}

fn edge_kind_allowed(kind: EdgeKind, filter: Option<&[&str]>) -> bool {
    let Some(filter) = filter else {
        return true;
    };
    if filter.is_empty() {
        return false;
    }
    let kind_name = match kind {
        EdgeKind::Contains => "contains",
        EdgeKind::Definition => "definition",
        EdgeKind::Imports => "imports",
        EdgeKind::ReExports => "re_exports",
        EdgeKind::References => "references",
        EdgeKind::Calls => "calls",
        EdgeKind::Extends => "extends",
        EdgeKind::Implements => "implements",
        EdgeKind::TypeReferences => "type_references",
        EdgeKind::Exports => "exports",
        EdgeKind::DefinesChunk => "defines_chunk",
    };
    filter.iter().any(|candidate| {
        *candidate == kind_name || (*candidate == "call" && kind == EdgeKind::Calls)
    })
}

fn current_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
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
    fn weighted_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed: &NodeId,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> anyhow::Result<Vec<(NodeId, u32)>>;
    fn find_callers(
        &self,
        workspace_id: WorkspaceId,
        callee: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>>;
    fn find_callees(
        &self,
        workspace_id: WorkspaceId,
        caller: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>>;
    fn find_entry_points(
        &self,
        workspace_id: WorkspaceId,
        node: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>>;
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

        let from_kind = match start {
            NodeId::File(_) => "file",
            NodeId::Symbol(_) => "symbol",
            NodeId::Chunk(_) => "chunk",
        };
        let from_id = match start {
            NodeId::File(id) => *id as i64,
            NodeId::Symbol(id) => *id as i64,
            NodeId::Chunk(id) => *id as i64,
        };
        let to_kind = match end {
            NodeId::File(_) => "file",
            NodeId::Symbol(_) => "symbol",
            NodeId::Chunk(_) => "chunk",
        };
        let to_id = match end {
            NodeId::File(id) => *id as i64,
            NodeId::Symbol(id) => *id as i64,
            NodeId::Chunk(id) => *id as i64,
        };

        if let Some(edges) =
            self.cte_shortest_path(workspace_id, from_kind, from_id, to_kind, to_id, max_hops)?
        {
            Ok(Some(GraphPath {
                start: start.clone(),
                end: end.clone(),
                edges,
                truncated: false,
            }))
        } else {
            Ok(None)
        }
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

    fn weighted_neighborhood(
        &self,
        workspace_id: WorkspaceId,
        seed: &NodeId,
        max_hops: u32,
        node_limit: usize,
        edge_kind_filter: Option<&[&str]>,
    ) -> anyhow::Result<Vec<(NodeId, u32)>> {
        let seed_kind = match seed {
            NodeId::File(_) => "file",
            NodeId::Symbol(_) => "symbol",
            NodeId::Chunk(_) => "chunk",
        };
        let seed_id = match seed {
            NodeId::File(id) => *id as i64,
            NodeId::Symbol(id) => *id as i64,
            NodeId::Chunk(id) => *id as i64,
        };
        let result = GraphRepository::weighted_neighborhood(
            self,
            workspace_id,
            seed_kind,
            seed_id,
            max_hops,
            node_limit,
            edge_kind_filter,
        )?;
        Ok(result)
    }

    fn find_callers(
        &self,
        workspace_id: WorkspaceId,
        callee: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>> {
        let seed_kind = match callee {
            NodeId::File(_) => "file",
            NodeId::Symbol(_) => "symbol",
            NodeId::Chunk(_) => "chunk",
        };
        let seed_id = match callee {
            NodeId::File(id) => *id as i64,
            NodeId::Symbol(id) => *id as i64,
            NodeId::Chunk(id) => *id as i64,
        };
        let nodes = dh_storage::GraphRepository::directional_neighborhood(
            self,
            workspace_id,
            seed_kind,
            seed_id,
            "incoming",
            max_depth,
            1000,
            Some(&["call"]),
        )?;

        let mut hierarchy = Vec::new();
        for (node_id, depth) in nodes {
            if let Some(graph_node) = self.node(workspace_id, &node_id)? {
                hierarchy.push(dh_types::CallHierarchyNode {
                    node: graph_node,
                    call_depth: depth,
                    entry_point: None,
                });
            }
        }
        Ok(hierarchy)
    }

    fn find_callees(
        &self,
        workspace_id: WorkspaceId,
        caller: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>> {
        let seed_kind = match caller {
            NodeId::File(_) => "file",
            NodeId::Symbol(_) => "symbol",
            NodeId::Chunk(_) => "chunk",
        };
        let seed_id = match caller {
            NodeId::File(id) => *id as i64,
            NodeId::Symbol(id) => *id as i64,
            NodeId::Chunk(id) => *id as i64,
        };
        let nodes = dh_storage::GraphRepository::directional_neighborhood(
            self,
            workspace_id,
            seed_kind,
            seed_id,
            "outgoing",
            max_depth,
            1000,
            Some(&["call"]),
        )?;

        let mut hierarchy = Vec::new();
        for (node_id, depth) in nodes {
            if let Some(graph_node) = self.node(workspace_id, &node_id)? {
                hierarchy.push(dh_types::CallHierarchyNode {
                    node: graph_node,
                    call_depth: depth,
                    entry_point: None,
                });
            }
        }
        Ok(hierarchy)
    }

    fn find_entry_points(
        &self,
        workspace_id: WorkspaceId,
        node: &NodeId,
        max_depth: u32,
    ) -> anyhow::Result<Vec<dh_types::CallHierarchyNode>> {
        let callers = self.find_callers(workspace_id, node, max_depth)?;

        let mut entry_points = Vec::new();
        for mut caller in callers {
            let is_api = caller.node.file_path.as_ref().map_or(false, |p: &String| {
                p.contains("api/") || p.contains("routes/")
            });
            let is_cli =
                caller.node.label.starts_with("cli_") || caller.node.label.ends_with("_cmd");
            let is_handler = caller.node.label.ends_with("_handler");

            if is_api {
                caller.entry_point = Some(dh_types::EntryPointKind::ApiRoute);
                entry_points.push(caller);
            } else if is_cli {
                caller.entry_point = Some(dh_types::EntryPointKind::CliCommand);
                entry_points.push(caller);
            } else if is_handler {
                caller.entry_point = Some(dh_types::EntryPointKind::EventHandler);
                entry_points.push(caller);
            }
        }

        Ok(entry_points)
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
                    payload_json: None,
                });
                if edges.len() >= limit {
                    break;
                }
            }
        } else if let NodeId::Symbol(symbol_id) = from {
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
                    reason: format!("defined in file {}", symbol.file_id),
                    payload_json: None,
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
                    payload_json: None,
                });
                if edges.len() >= limit {
                    break;
                }
            }
        } else if let NodeId::Symbol(symbol_id) = to {
            if let Some(symbol) =
                GraphRepository::find_symbol_by_id(self, workspace_id, *symbol_id)?
            {
                edges.push(GraphEdge {
                    kind: EdgeKind::Contains,
                    from: NodeId::File(symbol.file_id),
                    to: NodeId::Symbol(symbol.id),
                    resolution: EdgeResolution::Resolved,
                    confidence: EdgeConfidence::Direct,
                    span: Some(symbol.span),
                    reason: format!("file contains symbol {}", symbol.name),
                    payload_json: None,
                });
            }
        }

        edges.truncate(limit);
        Ok(edges)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        GraphProjectionFreshness, GraphProjectionRepository, GraphService, HydratedGraphProjection,
        NodeId,
    };
    use dh_storage::{
        ChunkRepository, Database, FileRepository, GraphEdgeRepository, IndexStateRepository,
        SymbolRepository,
    };
    use dh_types::{
        Chunk, ChunkKind, EmbeddingStatus, File, FreshnessReason, FreshnessState, IndexRunStatus,
        IndexState, LanguageId, ParseStatus, Span, Symbol, SymbolKind, Visibility,
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

        db.insert_edges(
            &[
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
                    payload_json: None,
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
                    payload_json: None,
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
                    payload_json: None,
                },
            ],
            1,
        )?;

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

    fn mark_index_completed(db: &Database) -> anyhow::Result<()> {
        db.update_state(&IndexState {
            workspace_id: 1,
            schema_version: 1,
            index_version: 7,
            status: IndexRunStatus::Completed,
            active_run_id: None,
            total_files: 2,
            indexed_files: 2,
            dirty_files: 0,
            deleted_files: 0,
            last_scan_started_at_unix_ms: Some(1),
            last_scan_finished_at_unix_ms: Some(2),
            last_successful_index_at_unix_ms: Some(2),
            queued_embeddings: 0,
            last_error: None,
        })?;
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

    #[test]
    fn hydrated_projection_reports_current_hot_path() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;
        mark_index_completed(&db)?;

        let projection = HydratedGraphProjection::hydrate(&db, 1)?;
        let stats = projection.stats();

        assert_eq!(projection.freshness(), GraphProjectionFreshness::Current);
        assert_eq!(projection.index_version(), Some(7));
        assert!(stats.persisted_edge_count >= 3);
        assert!(stats.synthetic_edge_count >= 4);

        let outgoing = projection.graph_outgoing_edges(1, &NodeId::File(1), 20)?;
        assert!(outgoing
            .iter()
            .any(|edge| matches!(edge.kind, super::EdgeKind::Contains)));
        assert!(outgoing
            .iter()
            .any(|edge| matches!(edge.kind, super::EdgeKind::Imports)));

        let callees = projection.find_callees(1, &NodeId::Symbol(10), 4)?;
        assert!(callees.iter().any(|node| node.node.label == "b"));
        Ok(())
    }

    #[test]
    fn hydrated_projection_refuses_silent_stale_state() -> anyhow::Result<()> {
        let db = setup_db()?;
        seed(&db)?;
        db.update_state(&IndexState {
            workspace_id: 1,
            schema_version: 1,
            index_version: 8,
            status: IndexRunStatus::Parsing,
            active_run_id: Some("run-active".into()),
            total_files: 2,
            indexed_files: 1,
            dirty_files: 1,
            deleted_files: 0,
            last_scan_started_at_unix_ms: Some(3),
            last_scan_finished_at_unix_ms: None,
            last_successful_index_at_unix_ms: Some(2),
            queued_embeddings: 0,
            last_error: None,
        })?;

        let projection = HydratedGraphProjection::hydrate(&db, 1)?;
        assert_eq!(projection.freshness(), GraphProjectionFreshness::Stale);
        assert!(projection.freshness_reason().contains("not complete"));
        Ok(())
    }
}
