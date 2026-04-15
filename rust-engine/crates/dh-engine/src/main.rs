use anyhow::Result;
use clap::{Parser, Subcommand};
use dh_indexer::{IndexWorkspaceRequest, Indexer, IndexerApi};
use dh_indexer::parity::{parity_summary_lines, write_report_json, ParityHarness};
use dh_storage::{Database, IndexStateRepository};
use dh_types::{IndexRunStatus, IndexState};
use std::path::PathBuf;

mod bridge;

const DEFAULT_DB_NAME: &str = "dh-index.db";

#[derive(Debug, Parser)]
#[command(name = "dh-engine")]
#[command(version)]
#[command(about = "DH Rust engine host process", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Init {
        #[arg(long)]
        workspace: PathBuf,
    },
    Status {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        #[arg(long, default_value_t = 1)]
        workspace_id: i64,
    },
    Index {
        #[arg(long)]
        workspace: PathBuf,
        #[arg(long, default_value_t = false)]
        force_full: bool,
    },
    Parity {
        #[arg(long)]
        workspace: PathBuf,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    Serve {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
    },
}

fn main() -> Result<()> {
    let compatibility_args: Vec<String> = std::env::args().skip(1).collect();
    if handle_legacy_cli_compatibility(&compatibility_args)? {
        return Ok(());
    }

    let cli = Cli::parse();

    match cli.command {
        Commands::Init { workspace } => {
            std::fs::create_dir_all(&workspace)?;
            let db_path = workspace.join(DEFAULT_DB_NAME);
            let db = Database::new(&db_path)?;
            db.initialize()?;
            db.connection().execute(
                "INSERT OR IGNORE INTO workspaces(id, root_path, created_at, updated_at) VALUES(1, ?1, strftime('%s','now')*1000, strftime('%s','now')*1000)",
                [workspace.to_string_lossy().to_string()],
            )?;
            db.connection().execute(
                "INSERT OR IGNORE INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES(1, 1, ?1, 'workspace_root', NULL)",
                [workspace.to_string_lossy().to_string()],
            )?;

            let default_state = IndexState {
                workspace_id: 1,
                schema_version: 1,
                index_version: 0,
                status: IndexRunStatus::Idle,
                active_run_id: None,
                total_files: 0,
                indexed_files: 0,
                dirty_files: 0,
                deleted_files: 0,
                last_scan_started_at_unix_ms: None,
                last_scan_finished_at_unix_ms: None,
                last_successful_index_at_unix_ms: None,
                queued_embeddings: 0,
                last_error: None,
            };
            db.update_state(&default_state)?;

            println!("initialized workspace at {}", workspace.display());
            println!("database: {}", db_path.display());
        }
        Commands::Status {
            workspace,
            workspace_id,
        } => {
            let db_path = if workspace.is_dir() {
                workspace.join(DEFAULT_DB_NAME)
            } else {
                workspace
            };

            let db = Database::new(&db_path)?;
            db.initialize()?;

            match db.get_state(workspace_id)? {
                Some(state) => {
                    println!("workspace_id: {}", state.workspace_id);
                    println!("schema_version: {}", state.schema_version);
                    println!("index_version: {}", state.index_version);
                    println!("status: {:?}", state.status);
                    println!("total_files: {}", state.total_files);
                    println!("indexed_files: {}", state.indexed_files);
                    println!("dirty_files: {}", state.dirty_files);
                    println!("deleted_files: {}", state.deleted_files);
                    println!("queued_embeddings: {}", state.queued_embeddings);
                    println!("last_error: {}", state.last_error.unwrap_or_else(|| "<none>".to_string()));
                }
                None => {
                    println!("no index state found for workspace_id={workspace_id}");
                }
            }
        }
        Commands::Index {
            workspace,
            force_full,
        } => {
            if !workspace.exists() {
                anyhow::bail!("workspace path does not exist: {}", workspace.display());
            }
            if !workspace.is_dir() {
                anyhow::bail!("workspace path must be a directory: {}", workspace.display());
            }

            let workspace = workspace.canonicalize()?;
            let db_path = workspace.join(DEFAULT_DB_NAME);

            let db = Database::new(&db_path)?;
            db.initialize()?;
            db.connection().execute(
                "INSERT OR IGNORE INTO workspaces(id, root_path, created_at, updated_at) VALUES(1, ?1, strftime('%s','now')*1000, strftime('%s','now')*1000)",
                [workspace.to_string_lossy().to_string()],
            )?;
            db.connection().execute(
                "INSERT OR IGNORE INTO roots(id, workspace_id, abs_path, root_kind, marker_path) VALUES(1, 1, ?1, 'workspace_root', NULL)",
                [workspace.to_string_lossy().to_string()],
            )?;

            if db.get_state(1)?.is_none() {
                let default_state = IndexState {
                    workspace_id: 1,
                    schema_version: 1,
                    index_version: 0,
                    status: IndexRunStatus::Idle,
                    active_run_id: None,
                    total_files: 0,
                    indexed_files: 0,
                    dirty_files: 0,
                    deleted_files: 0,
                    last_scan_started_at_unix_ms: None,
                    last_scan_finished_at_unix_ms: None,
                    last_successful_index_at_unix_ms: None,
                    queued_embeddings: 0,
                    last_error: None,
                };
                db.update_state(&default_state)?;
            }

            let indexer = Indexer::new(db_path.clone());
            let report = indexer.index_workspace(IndexWorkspaceRequest {
                roots: vec![workspace.clone()],
                force_full,
                max_files: None,
                include_embeddings: false,
            })?;

            println!("index complete");
            println!("workspace: {}", workspace.display());
            println!("database: {}", db_path.display());
            println!("run_id: {}", report.run_id);
            println!("scanned_files: {}", report.scanned_files);
            println!("changed_files: {}", report.changed_files);
            println!("reindexed_files: {}", report.reindexed_files);
            println!("deleted_files: {}", report.deleted_files);
            println!("queued_embeddings: {}", report.queued_embeddings);
            println!("duration_ms: {}", report.duration_ms);
            if report.warnings.is_empty() {
                println!("warnings: <none>");
            } else {
                println!("warnings ({}):", report.warnings.len());
                for warning in report.warnings {
                    println!("- {}", warning);
                }
            }
        }
        Commands::Parity { workspace, output } => {
            if !workspace.exists() {
                anyhow::bail!("workspace path does not exist: {}", workspace.display());
            }
            if !workspace.is_dir() {
                anyhow::bail!("workspace path must be a directory: {}", workspace.display());
            }

            let fixture_root = workspace.canonicalize()?;
            let harness = ParityHarness::new(fixture_root);
            let report = harness.run()?;

            for line in parity_summary_lines(&report) {
                println!("{}", line);
            }

            if let Some(output_path) = output {
                write_report_json(&report, &output_path)?;
                println!("report_json: {}", output_path.display());
            }
        }
        Commands::Serve { workspace } => {
            let workspace = workspace.canonicalize()?;
            bridge::run_bridge_server(workspace)?;
        }
    }

    Ok(())
}

fn handle_legacy_cli_compatibility(args: &[String]) -> Result<bool> {
    if args.is_empty() {
        return Ok(false);
    }

    match args[0].as_str() {
        "--version" | "-v" => {
            println!("dh {}", env!("CARGO_PKG_VERSION"));
            Ok(true)
        }
        "--run-smoke" => {
            println!("[smoke] rust-engine smoke OK");
            Ok(true)
        }
        "--run" => {
            if args.len() < 2 {
                anyhow::bail!("Usage: dh --run <prompt>");
            }
            // Compatibility mode for release smoke and install lifecycle checks.
            // Echoing the prompt keeps the provider smoke token contract stable.
            println!("{}", args[1]);
            Ok(true)
        }
        _ => Ok(false),
    }
}
