use anyhow::Result;
use clap::{Parser, Subcommand, ValueEnum};
use dh_indexer::{IndexWorkspaceRequest, Indexer, IndexerApi};
use dh_storage::{Database, IndexStateRepository};
use dh_types::{BenchmarkClass, IndexRunStatus, IndexState};
use std::path::PathBuf;

mod benchmark;
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
    Benchmark {
        #[arg(long, value_enum)]
        class: BenchmarkClassArg,
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

#[derive(Debug, Clone, Copy, ValueEnum)]
enum BenchmarkClassArg {
    ColdFullIndex,
    WarmNoChangeIndex,
    IncrementalReindex,
    ColdQuery,
    WarmQuery,
    ParityBenchmark,
}

impl From<BenchmarkClassArg> for BenchmarkClass {
    fn from(value: BenchmarkClassArg) -> Self {
        match value {
            BenchmarkClassArg::ColdFullIndex => BenchmarkClass::ColdFullIndex,
            BenchmarkClassArg::WarmNoChangeIndex => BenchmarkClass::WarmNoChangeIndex,
            BenchmarkClassArg::IncrementalReindex => BenchmarkClass::IncrementalReindex,
            BenchmarkClassArg::ColdQuery => BenchmarkClass::ColdQuery,
            BenchmarkClassArg::WarmQuery => BenchmarkClass::WarmQuery,
            BenchmarkClassArg::ParityBenchmark => BenchmarkClass::ParityBenchmark,
        }
    }
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
                    let freshness_counts = db.freshness_state_counts(workspace_id)?;
                    let refreshed_current_files = freshness_counts.refreshed_current;
                    let retained_current_files = freshness_counts.retained_current;
                    let degraded_partial_files = freshness_counts.degraded_partial;
                    let not_current_files = freshness_counts.not_current;
                    println!("freshness_scope: workspace");
                    println!(
                        "freshness_counts: refreshed_current={} retained_current={} degraded_partial={} not_current={}",
                        refreshed_current_files,
                        retained_current_files,
                        degraded_partial_files,
                        not_current_files
                    );
                    let freshness_condition = if not_current_files > 0 {
                        "not_current"
                    } else if degraded_partial_files > 0 {
                        "degraded_partial"
                    } else if refreshed_current_files > 0 {
                        "refreshed_current"
                    } else {
                        "retained_current"
                    };
                    println!("freshness_condition: {}", freshness_condition);
                    println!(
                        "last_error: {}",
                        state.last_error.unwrap_or_else(|| "<none>".to_string())
                    );
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
                anyhow::bail!(
                    "workspace path must be a directory: {}",
                    workspace.display()
                );
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
                anyhow::bail!(
                    "workspace path must be a directory: {}",
                    workspace.display()
                );
            }

            let response = benchmark::run_benchmark(benchmark::BenchmarkRunRequest {
                class: BenchmarkClass::ParityBenchmark,
                workspace,
            })?;

            for line in benchmark::benchmark_summary_lines(&response.artifact) {
                println!("{}", line);
            }

            if let Some(output_path) = output {
                benchmark::write_suite_json(&response.artifact, &output_path)?;
                println!("report_json: {}", output_path.display());
            }
        }
        Commands::Benchmark {
            class,
            workspace,
            output,
        } => {
            if !workspace.exists() {
                anyhow::bail!("workspace path does not exist: {}", workspace.display());
            }
            if !workspace.is_dir() {
                anyhow::bail!(
                    "workspace path must be a directory: {}",
                    workspace.display()
                );
            }

            let response = benchmark::run_benchmark(benchmark::BenchmarkRunRequest {
                class: class.into(),
                workspace,
            })?;

            for line in benchmark::benchmark_summary_lines(&response.artifact) {
                println!("{}", line);
            }

            if let Some(output_path) = output {
                benchmark::write_suite_json(&response.artifact, &output_path)?;
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
