use dh_indexer::{IndexWorkspaceRequest, Indexer, IndexerApi};
use dh_storage::{Database, FileRepository, GraphEdgeRepository};
use dh_types::{EdgeKind, EdgeResolution, NodeId};
use serde_json::Value;
use std::fs;
use std::path::Path;
use tempfile::TempDir;

#[test]
fn linker_binds_relative_import_to_indexed_file_and_persists_payload_metadata() {
    let fixture = TempDir::new().expect("create temp workspace");
    let workspace = fixture.path();
    seed_relative_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());
    let report = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("index relative fixture");

    assert_eq!(report.scanned_files, 2);
    assert_eq!(report.imports_extracted, 1);
    assert_eq!(report.linked_imports, 1);
    assert_eq!(report.unresolved_imports, 0);

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let main = db
        .get_file_by_path(1, "src/main.ts")
        .expect("lookup main")
        .expect("main exists");
    let helper = db
        .get_file_by_path(1, "src/helper.ts")
        .expect("lookup helper")
        .expect("helper exists");
    let edges = db
        .find_outgoing_edges(1, "file", main.id, 100)
        .expect("read graph edges");
    let import_edge = edges
        .iter()
        .find(|edge| edge.kind == EdgeKind::Imports)
        .expect("import edge persisted");

    assert_eq!(import_edge.resolution, EdgeResolution::Resolved);
    assert_eq!(import_edge.to, NodeId::File(helper.id));
    assert_ne!(import_edge.to, NodeId::Symbol(0));
    assert!(import_edge.reason.contains("resolved import './helper'"));

    let payload = edge_payload(import_edge);
    assert_eq!(payload["link_status"], "linked");
    assert_eq!(payload["link_reason"], "resolved_path_matched_indexed_file");
    assert_eq!(payload["resolver_status"], "resolved");
    assert_eq!(payload["target_file_id"], helper.id);
    assert!(payload["resolved_abs_path"]
        .as_str()
        .is_some_and(|path| path.ends_with("src/helper.ts")));
}

#[test]
fn linker_records_useful_unresolved_metadata_without_placeholder_symbol_zero() {
    let fixture = TempDir::new().expect("create temp workspace");
    let workspace = fixture.path();
    fs::create_dir_all(workspace.join("src")).expect("create src");
    fs::write(
        workspace.join("src/main.ts"),
        r#"import { missing } from "./missing";

export function run(): number {
  return missing();
}
"#,
    )
    .expect("write main fixture");

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());
    let report = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("index unresolved fixture");

    assert_eq!(report.scanned_files, 1);
    assert_eq!(report.unresolved_imports, 1);

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let main = db
        .get_file_by_path(1, "src/main.ts")
        .expect("lookup main")
        .expect("main exists");
    let edges = db
        .find_outgoing_edges(1, "file", main.id, 100)
        .expect("read graph edges");
    let import_edge = edges
        .iter()
        .find(|edge| edge.kind == EdgeKind::Imports)
        .expect("import edge persisted");

    assert_eq!(import_edge.resolution, EdgeResolution::Unresolved);
    assert_eq!(import_edge.to, NodeId::File(main.id));
    assert_ne!(import_edge.to, NodeId::Symbol(0));
    assert!(import_edge.reason.contains("not_found"));

    let payload = edge_payload(import_edge);
    assert_eq!(payload["link_status"], "unresolved");
    assert_eq!(payload["resolver_status"], "unresolved");
    assert_eq!(payload["resolver_reason"], "not_found");
}

#[test]
fn linker_links_workspace_package_cross_root_imports() {
    let fixture = TempDir::new().expect("create temp workspace");
    let workspace = fixture.path();
    seed_workspace_package_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());
    let report = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("index package-root fixture");

    assert_eq!(report.scanned_files, 2);
    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let app = db
        .get_file_by_path(1, "packages/app/src/main.ts")
        .expect("lookup app")
        .expect("app exists");
    assert_eq!(report.linked_imports, 1);
    assert_eq!(report.linked_cross_root_imports, 1);
    let shared = db
        .get_file_by_path(1, "packages/shared/src/index.ts")
        .expect("lookup shared")
        .expect("shared exists");
    let import_edge = db
        .find_outgoing_edges(1, "file", app.id, 100)
        .expect("read graph edges")
        .into_iter()
        .find(|edge| edge.kind == EdgeKind::Imports)
        .expect("package import edge persisted");

    assert_eq!(import_edge.resolution, EdgeResolution::Resolved);
    assert_eq!(import_edge.to, NodeId::File(shared.id));

    let payload = edge_payload(&import_edge);
    assert_eq!(payload["link_status"], "linked");
    assert!(matches!(
        payload["resolver_reason"].as_str(),
        Some("cross_root_resolved" | "workspace_package_resolved" | "package_export_resolved")
    ));
    assert!(payload["source_root"].is_string());
    assert!(payload["target_root"].is_string());
}

fn seed_relative_project(workspace: &Path) {
    fs::create_dir_all(workspace.join("src")).expect("create src");
    fs::write(
        workspace.join("src/main.ts"),
        r#"import { helper } from "./helper";

export function run(): number {
  return helper();
}
"#,
    )
    .expect("write main");
    fs::write(
        workspace.join("src/helper.ts"),
        r#"export function helper(): number {
  return 1;
}
"#,
    )
    .expect("write helper");
}

fn seed_workspace_package_project(workspace: &Path) {
    let app_src = workspace.join("packages/app/src");
    let shared_src = workspace.join("packages/shared/src");
    fs::create_dir_all(&app_src).expect("create app src");
    fs::create_dir_all(&shared_src).expect("create shared src");
    fs::write(
        workspace.join("packages/app/package.json"),
        r#"{ "name": "@fixture/app" }"#,
    )
    .expect("write app package");
    fs::write(
        workspace.join("packages/shared/package.json"),
        r#"{ "name": "@fixture/shared", "main": "src/index.ts" }"#,
    )
    .expect("write shared package");
    fs::write(
        app_src.join("main.ts"),
        r#"import { shared } from "@fixture/shared";

export function run(): string {
  return shared();
}
"#,
    )
    .expect("write app main");
    fs::write(
        shared_src.join("index.ts"),
        r#"export function shared(): string {
  return "shared";
}
"#,
    )
    .expect("write shared index");
}

fn edge_payload(edge: &dh_types::GraphEdge) -> Value {
    serde_json::from_str(
        edge.payload_json
            .as_deref()
            .expect("graph edge should carry payload_json"),
    )
    .expect("payload_json should be valid JSON")
}
