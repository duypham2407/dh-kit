use dh_indexer::{IndexPathsRequest, IndexWorkspaceRequest, Indexer, IndexerApi};
use dh_storage::{
    CallEdgeRepository, ChunkRepository, Database, FileRepository, ImportRepository,
    IndexStateRepository, ReferenceRepository, SymbolRepository,
};
use dh_types::{FreshnessReason, FreshnessState, ParseStatus};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

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
        .find_imports_by_file(main_file.id)
        .expect("imports lookup should not fail");
    assert!(imports.iter().any(|item| item.raw_specifier == "./util"));
    assert!(imports.iter().any(|item| item.raw_specifier == "./service"));

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
        !db.find_imports_by_file(main_before.id)
            .expect("imports lookup before invalidation should not fail")
            .is_empty(),
        "main.ts should have import facts before invalidation"
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
        db.find_imports_by_file(main_after.id)
            .expect("imports lookup after invalidation should not fail")
            .is_empty(),
        "invalidate_paths must clear stale import facts"
    );
    assert!(
        db.find_call_edges_by_file(main_after.id)
            .expect("call-edge lookup after invalidation should not fail")
            .is_empty(),
        "invalidate_paths must clear stale call-edge facts"
    );
    assert!(
        db.find_references_by_file(main_after.id)
            .expect("reference lookup after invalidation should not fail")
            .is_empty(),
        "invalidate_paths must clear stale reference facts"
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
  return v + 100;
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
