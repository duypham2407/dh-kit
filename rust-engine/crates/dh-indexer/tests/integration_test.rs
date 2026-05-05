use dh_indexer::{IndexPathsRequest, IndexWorkspaceRequest, Indexer, IndexerApi};
use dh_storage::{
    ChunkRepository, Database, FileRepository, GraphEdgeRepository, IndexStateRepository,
    SymbolRepository,
};
use dh_types::{EdgeKind, FreshnessReason, FreshnessState, NodeId, ParseStatus};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tempfile::TempDir;

#[test]
fn index_workspace_records_multiple_roots_with_distinct_root_ids() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let root_a = fixture.path().join("root-a");
    let root_b = fixture.path().join("root-b");

    fs::create_dir_all(root_a.join("src")).expect("create first root src dir");
    fs::create_dir_all(root_b.join("src")).expect("create second root src dir");
    fs::write(
        root_a.join("src/a.ts"),
        r#"export function fromA(): number {
  return 1;
}
"#,
    )
    .expect("write first root file");
    fs::write(
        root_b.join("src/b.ts"),
        r#"export function fromB(): number {
  return 2;
}
"#,
    )
    .expect("write second root file");

    let db_path = fixture.path().join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    let report = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![root_a, root_b],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("multi-root index should succeed");

    assert_eq!(report.workspace_root_count, 2);
    assert_eq!(report.package_root_count, 2);

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let root_ids = db
        .list_files_by_workspace(1)
        .expect("list indexed files by workspace")
        .into_iter()
        .map(|file| file.root_id)
        .collect::<HashSet<_>>();
    assert_eq!(root_ids.len(), 2);
}

#[test]
fn index_workspace_allows_same_rel_path_in_different_roots() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let root_a = fixture.path().join("root-a");
    let root_b = fixture.path().join("root-b");

    fs::create_dir_all(root_a.join("src")).expect("create first root src dir");
    fs::create_dir_all(root_b.join("src")).expect("create second root src dir");
    fs::write(
        root_a.join("src/index.ts"),
        r#"export function fromA(): string {
  return "a";
}
"#,
    )
    .expect("write first root index");
    fs::write(
        root_b.join("src/index.ts"),
        r#"export function fromB(): string {
  return "b";
}
"#,
    )
    .expect("write second root index");

    let db_path = fixture.path().join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    let report = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![root_a, root_b],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("multi-root duplicate-rel-path index should succeed");

    assert_eq!(report.scanned_files, 2);
    assert_eq!(report.reindexed_files, 2);
    assert_eq!(report.deleted_files, 0);

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let files = db
        .list_files_by_workspace(1)
        .expect("list indexed files by workspace");
    let duplicate_rel_files = files
        .iter()
        .filter(|file| file.rel_path == "src/index.ts")
        .collect::<Vec<_>>();
    assert_eq!(
        duplicate_rel_files.len(),
        2,
        "same rel_path under different roots should persist two file rows"
    );
    assert_ne!(duplicate_rel_files[0].id, duplicate_rel_files[1].id);
    assert_ne!(
        duplicate_rel_files[0].root_id,
        duplicate_rel_files[1].root_id
    );
}

#[test]
fn index_workspace_resolves_cross_root_import_to_non_primary_root() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let app_root = fixture.path().join("app");
    let shared_root = fixture.path().join("shared");
    seed_cross_root_package_project(&app_root, &shared_root);

    let db_path = fixture.path().join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    let report = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![app_root, shared_root],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("cross-root package index should succeed");

    assert_eq!(report.scanned_files, 2);
    assert_eq!(report.linked_imports, 1);
    assert_eq!(report.linked_cross_root_imports, 1);
    assert_eq!(report.unresolved_imports, 0);

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let files = db
        .list_files_by_workspace(1)
        .expect("list indexed files by workspace");
    let app_file = files
        .iter()
        .find(|file| file.root_id == 1 && file.rel_path == "src/main.ts")
        .expect("app file should be under primary root");
    let shared_file = files
        .iter()
        .find(|file| file.root_id == 2 && file.rel_path == "src/index.ts")
        .expect("shared file should be under non-primary root");

    let import_edge = db
        .find_outgoing_edges(1, "file", app_file.id as i64, 100)
        .expect("read app outgoing edges")
        .into_iter()
        .find(|edge| edge.kind == EdgeKind::Imports)
        .expect("app import edge should persist");

    assert_eq!(import_edge.resolution, dh_types::EdgeResolution::Resolved);
    assert_eq!(import_edge.to, NodeId::File(shared_file.id));
}

#[test]
fn index_paths_reindexes_file_under_non_primary_root() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let root_a = fixture.path().join("root-a");
    let root_b = fixture.path().join("root-b");

    fs::create_dir_all(root_a.join("src")).expect("create first root src dir");
    fs::create_dir_all(root_b.join("src")).expect("create second root src dir");
    fs::write(
        root_a.join("src/index.ts"),
        r#"export function value(): string {
  return "a";
}
"#,
    )
    .expect("write first root index");
    fs::write(
        root_b.join("src/index.ts"),
        r#"export function value(): string {
  return "b";
}
"#,
    )
    .expect("write second root index");

    let db_path = fixture.path().join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());
    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![root_a.clone(), root_b.clone()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial multi-root index should succeed");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let before_files = db
        .list_files_by_workspace(1)
        .expect("list files before path reindex");
    let first_root_file_before = before_files
        .iter()
        .find(|file| file.root_id == 1 && file.rel_path == "src/index.ts")
        .expect("first root file before reindex");
    let second_root_file_before = before_files
        .iter()
        .find(|file| file.root_id == 2 && file.rel_path == "src/index.ts")
        .expect("second root file before reindex");
    let first_root_hash_before = first_root_file_before.content_hash.clone();
    let second_root_id = second_root_file_before.id;

    fs::write(
        root_b.join("src/index.ts"),
        r#"export function value(): string {
  return "b2";
}
"#,
    )
    .expect("modify non-primary root index");

    let result = indexer
        .index_paths(IndexPathsRequest {
            workspace_id: 1,
            paths: vec![root_b.join("src/index.ts")],
            expand_dependents: false,
        })
        .expect("path-scoped non-primary reindex should succeed");

    assert!(result.reindexed_files >= 1);
    assert_eq!(result.deleted_files, 0);

    let after_files = db
        .list_files_by_workspace(1)
        .expect("list files after path reindex");
    let first_root_file_after = after_files
        .iter()
        .find(|file| file.root_id == 1 && file.rel_path == "src/index.ts")
        .expect("first root file after reindex");
    let second_root_file_after = after_files
        .iter()
        .find(|file| file.root_id == 2 && file.rel_path == "src/index.ts")
        .expect("second root file after reindex");

    assert_eq!(first_root_file_after.content_hash, first_root_hash_before);
    assert_eq!(second_root_file_after.id, second_root_id);
    assert_ne!(
        second_root_file_after.content_hash, second_root_file_before.content_hash,
        "non-primary root file hash should refresh without colliding with primary root file"
    );
    assert_eq!(after_files.len(), 2);
}

#[test]
fn indexer_pipeline_end_to_end_incremental_and_delete() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    let first = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("first index run should succeed");

    assert_eq!(first.scanned_files, 3);
    assert_eq!(first.changed_files, 3);
    assert_eq!(first.reindexed_files, 3);
    assert_eq!(first.deleted_files, 0);

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let files = db
        .list_files_by_workspace(1)
        .expect("list indexed files by workspace");
    assert_eq!(files.len(), 3);

    let symbols_named_service = db
        .find_symbol_by_name(1, "Service")
        .expect("query symbols by name");
    assert!(!symbols_named_service.is_empty());

    let main_file = db
        .get_file_by_path(1, "src/main.ts")
        .expect("main file lookup should not fail")
        .expect("main file should exist");
    let imports = db
        .find_outgoing_edges(1, "file", main_file.id as i64, 1000)
        .expect("edges lookup should not fail");
    assert!(imports.iter().any(|item| item.reason.contains("./util")));
    assert!(imports.iter().any(|item| item.reason.contains("./service")));

    let second = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("second index run should succeed");

    assert_eq!(second.scanned_files, 3);
    assert_eq!(second.changed_files, 0);
    assert_eq!(second.reindexed_files, 0);
    assert_eq!(second.deleted_files, 0);

    fs::write(
        workspace.join("src/util.ts"),
        "export function helper(v: number): number {\n  return v + 2;\n}\n",
    )
    .expect("rewrite util.ts");

    let third = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("third index run should succeed");

    assert_eq!(third.scanned_files, 3);
    assert_eq!(third.changed_files, 1);
    assert!(
        third.reindexed_files >= 1,
        "implementation-only changes must reindex changed file, and may conservatively refresh direct dependents"
    );
    assert_eq!(third.deleted_files, 0);

    fs::remove_file(workspace.join("src/service.ts")).expect("remove service.ts");

    let fourth = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("fourth index run should succeed");

    assert_eq!(fourth.scanned_files, 2);
    assert_eq!(fourth.deleted_files, 1);

    let deleted_file = db
        .get_file_by_path(1, "src/service.ts")
        .expect("deleted file lookup should not fail")
        .expect("deleted file record should still exist");
    assert!(deleted_file.deleted_at_unix_ms.is_some());
    assert_eq!(deleted_file.parse_status, ParseStatus::Skipped);
    assert!(db
        .find_symbols_by_file(deleted_file.id)
        .expect("deleted file symbols lookup should not fail")
        .is_empty());

    let state = db
        .get_state(1)
        .expect("state lookup should not fail")
        .expect("state should exist");
    assert!(state.last_successful_index_at_unix_ms.is_some());
}

#[cfg(unix)]
#[test]
fn hash_read_failure_marks_existing_file_failed_and_clears_facts() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index run should succeed");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let service_before = db
        .get_file_by_path(1, "src/service.ts")
        .expect("service file lookup should not fail")
        .expect("service file should exist before permission change");

    assert!(
        !db.find_symbols_by_file(service_before.id)
            .expect("service symbols lookup should not fail")
            .is_empty(),
        "service.ts should have extracted symbols before hash-read failure"
    );

    let service_path = workspace.join("src/service.ts");
    let original_permissions = fs::metadata(&service_path)
        .expect("read service.ts metadata")
        .permissions();

    let mut unreadable_permissions = original_permissions.clone();
    unreadable_permissions.set_mode(0o000);
    fs::set_permissions(&service_path, unreadable_permissions).expect("make service.ts unreadable");

    let rerun = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("reindex after permission change should succeed");

    fs::set_permissions(&service_path, original_permissions)
        .expect("restore service.ts permissions");

    assert!(
        rerun.warnings.iter().any(
            |warning| warning.contains("failed to read file for hashing")
                && warning.contains("service.ts")
        ),
        "warnings should include hash-read failure for service.ts"
    );

    let service_after = db
        .get_file_by_path(1, "src/service.ts")
        .expect("service file lookup after failure should not fail")
        .expect("service file record should still exist after hash-read failure");

    assert_eq!(service_after.parse_status, ParseStatus::Failed);
    assert!(
        service_after
            .parse_error
            .as_deref()
            .is_some_and(|error| error.contains("failed to read file for hashing")),
        "parse_error should capture hash-read failure"
    );

    assert!(
        db.find_symbols_by_file(service_after.id)
            .expect("service symbols lookup after failure should not fail")
            .is_empty(),
        "stale symbols must be deleted when hash read fails"
    );

    assert!(
        db.find_chunks_by_file(service_after.id)
            .expect("service chunks lookup after failure should not fail")
            .is_empty(),
        "stale chunks must be deleted when hash read fails"
    );
}

#[test]
fn index_paths_reindexes_requested_path() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    let result = indexer
        .index_paths(IndexPathsRequest {
            workspace_id: 1,
            paths: vec![workspace.join("src/util.ts")],
            expand_dependents: false,
        })
        .expect("index_paths should succeed");

    assert!(result.reindexed_files >= 1);
    assert!(result.changed_files >= 1);
}

#[test]
fn indexer_persists_run_lane_command_imports_without_duplicate_ids() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();
    let rel_path = "packages/opencode-app/src/workflows/run-lane-command.ts";
    let source =
        include_str!("../../../../packages/opencode-app/src/workflows/run-lane-command.ts");

    let target_path = workspace.join(rel_path);
    fs::create_dir_all(
        target_path
            .parent()
            .expect("fixture target should have a parent directory"),
    )
    .expect("create fixture directories");
    fs::write(&target_path, source).expect("write affected TypeScript fixture");

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("indexing affected TypeScript fixture should not fail on duplicate import IDs");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let indexed_file = db
        .get_file_by_path(1, rel_path)
        .expect("affected file lookup should not fail")
        .expect("affected file should be indexed");
    let imports: Vec<_> = db
        .find_outgoing_edges(1, "file", indexed_file.id as i64, 1000)
        .expect("edges lookup should not fail")
        .into_iter()
        .filter(|e| e.kind == dh_types::EdgeKind::Imports)
        .collect();
    let mut unique_targets = HashSet::new();
    for edge in &imports {
        let span_tuple = edge.span.as_ref().map(|s| (s.start_line, s.end_line));
        unique_targets.insert((edge.to.clone(), edge.reason.clone(), span_tuple));
    }

    assert!(
        unique_targets.len() > 0,
        "persisted edges for the affected file must not be empty"
    );
    assert!(
        imports.iter().any(|edge| {
            edge.reason
                .contains("../../../shared/src/constants/roles.js")
                && edge.kind == dh_types::EdgeKind::Imports
        }),
        "indexing must preserve concrete imports from the affected file"
    );
    assert!(
        imports.iter().any(|edge| {
            edge.reason.contains("../../../shared/src/types/lane.js")
                && edge.kind == dh_types::EdgeKind::Imports
        }),
        "indexing must preserve type-only imports from the affected file"
    );
}

#[cfg(unix)]
#[test]
fn index_paths_hash_read_failure_marks_file_not_current_and_clears_facts() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    let service_path = workspace.join("src/service.ts");
    let original_permissions = fs::metadata(&service_path)
        .expect("read service.ts metadata")
        .permissions();

    let mut unreadable_permissions = original_permissions.clone();
    unreadable_permissions.set_mode(0o000);
    fs::set_permissions(&service_path, unreadable_permissions).expect("make service.ts unreadable");

    let rerun = indexer
        .index_paths(IndexPathsRequest {
            workspace_id: 1,
            paths: vec![workspace.join("src/service.ts")],
            expand_dependents: false,
        })
        .expect("path-scoped reindex should complete with warnings");

    fs::set_permissions(&service_path, original_permissions)
        .expect("restore service.ts permissions");

    assert!(
        rerun.warnings.iter().any(
            |warning| warning.contains("failed to read file for hashing")
                && warning.contains("service.ts")
        ),
        "warnings should include path-scoped hash-read failure for service.ts"
    );

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let service_after = db
        .get_file_by_path(1, "src/service.ts")
        .expect("service file lookup after failure should not fail")
        .expect("service file should still exist");

    assert_eq!(service_after.parse_status, ParseStatus::Failed);
    assert_eq!(service_after.freshness_state, FreshnessState::NotCurrent);
    assert!(
        service_after
            .parse_error
            .as_deref()
            .is_some_and(|error| error.contains("failed to read file for hashing")),
        "parse_error should include hash-read failure details"
    );

    assert!(
        db.find_symbols_by_file(service_after.id)
            .expect("service symbols lookup after path-scoped failure should not fail")
            .is_empty(),
        "stale symbols must be deleted for path-scoped hash failures"
    );

    assert!(
        db.find_chunks_by_file(service_after.id)
            .expect("service chunks lookup after path-scoped failure should not fail")
            .is_empty(),
        "stale chunks must be deleted for path-scoped hash failures"
    );
}

#[cfg(unix)]
#[test]
fn index_paths_fatal_failures_expand_invalidation_to_dependents() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    let service_path = workspace.join("src/service.ts");
    let original_permissions = fs::metadata(&service_path)
        .expect("read service.ts metadata")
        .permissions();
    let mut unreadable_permissions = original_permissions.clone();
    unreadable_permissions.set_mode(0o000);
    fs::set_permissions(&service_path, unreadable_permissions).expect("make service.ts unreadable");

    let rerun = indexer
        .index_paths(IndexPathsRequest {
            workspace_id: 1,
            paths: vec![service_path.clone()],
            expand_dependents: false,
        })
        .expect("path-scoped reindex should complete with warnings");

    fs::set_permissions(&service_path, original_permissions)
        .expect("restore service.ts permissions");

    assert!(
        rerun.warnings.iter().any(
            |warning| warning.contains("failed to read file for hashing")
                && warning.contains("service.ts")
        ),
        "warnings should include fatal hash-read failure"
    );

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let service = db
        .get_file_by_path(1, "src/service.ts")
        .expect("service file lookup should not fail")
        .expect("service file should still exist");
    assert_eq!(service.freshness_state, FreshnessState::NotCurrent);
    assert_eq!(
        service.freshness_reason,
        Some(FreshnessReason::FatalReadFailure),
        "fatal read failures must be represented as not-current freshness roots"
    );

    let main = db
        .get_file_by_path(1, "src/main.ts")
        .expect("main file lookup should not fail")
        .expect("main file should still exist");
    assert_eq!(
        main.freshness_reason,
        Some(FreshnessReason::DependentInvalidated),
        "fatal upstream failures must widen invalidation to downstream dependents"
    );
    assert_ne!(
        main.freshness_state,
        FreshnessState::RetainedCurrent,
        "downstream file must not remain implicitly retained-current after upstream fatal failure"
    );
}

#[test]
fn refresh_unchanged_files_does_not_upgrade_degraded_partial_files() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("first index run should succeed");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let mut service = db
        .get_file_by_path(1, "src/service.ts")
        .expect("service file lookup should not fail")
        .expect("service file should exist");

    service.freshness_state = FreshnessState::DegradedPartial;
    service.freshness_reason = Some(FreshnessReason::RecoverableParseIssues);
    service.parse_status = ParseStatus::ParsedWithErrors;
    service.parse_error = Some("recoverable parse diagnostics".to_string());
    db.upsert_file(&service)
        .expect("seed degraded freshness state for unchanged refresh test");

    let second = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("second unchanged index run should succeed");

    assert_eq!(second.changed_files, 0);
    assert_eq!(second.reindexed_files, 0);

    let service = db
        .get_file_by_path(1, "src/service.ts")
        .expect("service file lookup should not fail")
        .expect("service file should still exist");

    assert_eq!(
        service.freshness_state,
        FreshnessState::DegradedPartial,
        "refresh_unchanged_files must not upgrade degraded files without successful refresh"
    );
    assert_eq!(
        service.freshness_reason,
        Some(FreshnessReason::RecoverableParseIssues),
        "degraded reason should remain explicit until a successful refresh clears it"
    );
}

#[test]
fn invalidate_paths_clears_stale_facts_atomically() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");

    let main_before = db
        .get_file_by_path(1, "src/main.ts")
        .expect("main file lookup should not fail")
        .expect("main file should exist before invalidation");

    assert!(
        !db.find_symbols_by_file(main_before.id)
            .expect("symbols lookup before invalidation should not fail")
            .is_empty(),
        "main.ts should have symbol facts before invalidation"
    );
    assert!(
        !db.find_outgoing_edges(1, "file", main_before.id as i64, 1000)
            .expect("edges lookup before invalidation should not fail")
            .is_empty(),
        "main.ts should have edges before invalidation"
    );
    assert!(
        !db.find_chunks_by_file(main_before.id)
            .expect("chunks lookup before invalidation should not fail")
            .is_empty(),
        "main.ts should have chunk facts before invalidation"
    );

    indexer
        .invalidate_paths(1, vec![workspace.join("src/main.ts")])
        .expect("invalidate_paths should succeed");

    let main_after = db
        .get_file_by_path(1, "src/main.ts")
        .expect("main file lookup after invalidation should not fail")
        .expect("main file should still exist after invalidation");

    assert_eq!(main_after.freshness_state, FreshnessState::NotCurrent);
    assert_eq!(
        main_after.freshness_reason,
        Some(FreshnessReason::PathInvalidated)
    );
    assert_eq!(main_after.parse_status, ParseStatus::Pending);
    assert!(main_after.content_hash.is_empty());
    assert!(main_after.structure_hash.is_none());
    assert!(main_after.public_api_hash.is_none());
    assert_eq!(main_after.symbol_count, 0);
    assert_eq!(main_after.chunk_count, 0);

    assert!(
        db.find_symbols_by_file(main_after.id)
            .expect("symbols lookup after invalidation should not fail")
            .is_empty(),
        "invalidate_paths must clear stale symbol facts"
    );
    assert!(
        db.find_outgoing_edges(1, "file", main_after.id as i64, 1000)
            .expect("edges lookup after invalidation should not fail")
            .is_empty(),
        "invalidate_paths must clear stale edges"
    );
    assert!(
        db.find_chunks_by_file(main_after.id)
            .expect("chunks lookup after invalidation should not fail")
            .is_empty(),
        "invalidate_paths must clear stale chunk facts"
    );
}

#[test]
fn public_api_change_expands_to_dependents_after_confirmation() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    fs::write(
        workspace.join("src/util.ts"),
        r#"export function helper(v: number): number {
  const doubled = v * 2;
  return v + 1 + doubled - doubled;
}
"#,
    )
    .expect("rewrite util implementation only");

    let implementation_only = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("implementation-only change should succeed");

    assert_eq!(implementation_only.changed_files, 1);
    assert!(
        implementation_only.reindexed_files >= 1,
        "implementation-only changes must reindex changed file and may conservatively refresh direct dependents"
    );

    fs::write(
        workspace.join("src/util.ts"),
        r#"export function helperRenamed(v: number): number {
  return v + 100;
}
"#,
    )
    .expect("rewrite util public API");

    let public_api_change = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("public API change index should succeed");

    assert_eq!(public_api_change.changed_files, 1);
    assert!(
        public_api_change.reindexed_files >= 2,
        "dependent invalidation should refresh at least one importer after confirmed public API change"
    );
}

#[test]
fn implementation_only_change_preserves_downstream_edges_without_full_relink() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_fixture_project(workspace);

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let main = db
        .get_file_by_path(1, "src/main.ts")
        .expect("main file lookup should not fail")
        .expect("main file should exist");
    let main_imports_before = db
        .find_outgoing_edges(1, "file", main.id as i64, 1000)
        .expect("initial outgoing edge lookup should not fail")
        .into_iter()
        .filter(|edge| edge.kind == EdgeKind::Imports)
        .collect::<Vec<_>>();
    let main_import_targets_before = main_imports_before
        .iter()
        .filter_map(|edge| match edge.to {
            dh_types::NodeId::File(id) => Some(id),
            _ => None,
        })
        .collect::<HashSet<_>>();

    let mut util_source = fs::read_to_string(workspace.join("src/util.ts"))
        .expect("read util.ts before implementation-only rewrite");
    util_source.push_str("// implementation-only trailing comment\n");
    fs::write(workspace.join("src/util.ts"), util_source)
        .expect("rewrite util implementation only");

    let incremental = indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("implementation-only change should succeed");

    assert_eq!(incremental.changed_files, 1);
    assert_eq!(
        incremental.reindexed_files, 1,
        "implementation-only changes should stay path-local after confirmed hashes match public/structural fingerprints"
    );
    let workspace_imports_after = db
        .find_edges_by_workspace(1)
        .expect("workspace edge lookup after incremental should not fail")
        .into_iter()
        .filter(|edge| edge.kind == EdgeKind::Imports)
        .collect::<Vec<_>>();
    assert_eq!(
        workspace_imports_after.len(),
        main_import_targets_before.len(),
        "content-only incremental updates must not create duplicate import edges"
    );
    for target in &main_import_targets_before {
        assert!(
            workspace_imports_after.iter().any(|edge| {
                matches!(edge.from, dh_types::NodeId::File(id) if id == main.id)
                    && matches!(edge.to, dh_types::NodeId::File(id) if id == *target)
            }),
            "content-only incremental updates must preserve main import edge to target file {target}"
        );
    }
}

#[test]
fn stale_symbol_edges_are_removed_when_export_is_renamed() {
    let fixture = TempDir::new().expect("create temp fixture workspace");
    let workspace = fixture.path();

    seed_symbol_edge_project(workspace, "helper");

    let db_path = workspace.join("dh-index.db");
    let indexer = Indexer::new(db_path.clone());

    indexer
        .index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })
        .expect("initial index should succeed");

    let db = Database::new(&db_path).expect("open db");
    db.initialize().expect("initialize db");
    let util_before = db
        .get_file_by_path(1, "src/util.ts")
        .expect("util lookup before rename should not fail")
        .expect("util should exist before rename");
    let old_symbol_ids = db
        .find_symbols_by_file(util_before.id)
        .expect("util symbols lookup before rename should not fail")
        .into_iter()
        .map(|symbol| symbol.id)
        .collect::<HashSet<_>>();

    assert!(!old_symbol_ids.is_empty(), "util.ts should export symbols");
    assert!(
        db.find_edges_by_workspace(1)
            .expect("workspace edges lookup before rename should not fail")
            .iter()
            .any(|edge| edge_touches_any_symbol(edge, &old_symbol_ids)),
        "initial graph should contain call/reference edges touching the exported util symbol"
    );

    fs::write(
        workspace.join("src/util.ts"),
        r#"export function helperRenamed(): number {
  return 2;
}
"#,
    )
    .expect("rename util export");

    let rename_result = indexer
        .index_paths(IndexPathsRequest {
            workspace_id: 1,
            paths: vec![workspace.join("src/util.ts")],
            expand_dependents: false,
        })
        .expect("path-scoped reindex after export rename should succeed");

    assert!(
        rename_result.reindexed_files >= 1,
        "renaming the export should reindex util.ts"
    );
    assert!(
        db.find_edges_by_workspace(1)
            .expect("workspace edges lookup after rename should not fail")
            .iter()
            .all(|edge| !edge_touches_any_symbol(edge, &old_symbol_ids)),
        "reindex must remove graph_edges with old util symbol IDs as from/to symbol endpoints"
    );
}

fn seed_fixture_project(workspace: &Path) {
    fs::create_dir_all(workspace.join("src")).expect("create src dir");

    fs::write(
        workspace.join("src/main.ts"),
        r#"import { helper } from "./util";
import { Service } from "./service";

export function run(): number {
  const service = new Service();
  return helper(service.method());
}
"#,
    )
    .expect("write main.ts");

    fs::write(
        workspace.join("src/util.ts"),
        r#"export function helper(v: number): number {
  return v + 1;
}
"#,
    )
    .expect("write util.ts");

    fs::write(
        workspace.join("src/service.ts"),
        r#"export class Service {
  method(): number {
    return 41;
  }
}
"#,
    )
    .expect("write service.ts");
}

fn seed_cross_root_package_project(app_root: &Path, shared_root: &Path) {
    fs::create_dir_all(app_root.join("src")).expect("create app src dir");
    fs::create_dir_all(shared_root.join("src")).expect("create shared src dir");

    fs::write(
        shared_root.join("package.json"),
        r#"{ "name": "@fixture/shared", "main": "src/index.ts" }"#,
    )
    .expect("write shared package metadata");
    fs::write(
        app_root.join("src/main.ts"),
        r#"import { shared } from "@fixture/shared";

export function run(): string {
  return shared();
}
"#,
    )
    .expect("write app main");
    fs::write(
        shared_root.join("src/index.ts"),
        r#"export function shared(): string {
  return "shared";
}
"#,
    )
    .expect("write shared index");
}

fn seed_symbol_edge_project(workspace: &Path, export_name: &str) {
    fs::create_dir_all(workspace.join("src")).expect("create src dir");

    fs::write(
        workspace.join("src/main.ts"),
        format!(
            r#"import {{ {export_name} }} from "./util";

export function run(): number {{
  return {export_name}();
}}
"#
        ),
    )
    .expect("write main.ts");

    fs::write(
        workspace.join("src/util.ts"),
        format!(
            r#"export function {export_name}(): number {{
  return 1;
}}
"#
        ),
    )
    .expect("write util.ts");
}

fn edge_touches_any_symbol(
    edge: &dh_types::GraphEdge,
    symbol_ids: &HashSet<dh_types::SymbolId>,
) -> bool {
    matches!(&edge.from, NodeId::Symbol(id) if symbol_ids.contains(id))
        || matches!(&edge.to, NodeId::Symbol(id) if symbol_ids.contains(id))
}
