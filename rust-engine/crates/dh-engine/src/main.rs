use anyhow::Result;
use clap::{Parser, Subcommand};
use dh_storage::{Database, IndexStateRepository};
use dh_types::{IndexRunStatus, IndexState};
use std::path::PathBuf;

const DEFAULT_DB_NAME: &str = "dh-index.db";

#[derive(Debug, Parser)]
#[command(name = "dh-engine")]
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
}

fn main() -> Result<()> {
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
    }

    Ok(())
}
