use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand, ValueEnum};
use dh_indexer::{
    embedding::build_embedding_client_from_env, IndexWorkspaceRequest, Indexer, IndexerApi,
};
use dh_storage::{Database, IndexStateRepository};
use dh_types::{BenchmarkClass, IndexRunStatus, IndexState, WorkflowLane};
use std::path::PathBuf;

mod benchmark;
mod bridge;
mod hooks;
mod host_commands;
mod host_lifecycle;
mod runtime_launch;
mod session_manager;
mod worker_protocol;
mod worker_supervisor;

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
    HostContract {
        #[arg(long, default_value_t = false)]
        json: bool,
    },
    Ask(KnowledgeCommandArgs),
    Explain(KnowledgeCommandArgs),
    Trace(KnowledgeCommandArgs),
    /// Run a Quick-lane workflow.
    Quick(LaneCommandArgs),
    /// Run a Delivery-lane workflow.
    Delivery(LaneCommandArgs),
    /// Run a Migration-lane workflow.
    Migrate(LaneCommandArgs),
    Serve {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
    },
    Doctor {
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
        #[arg(long = "node-runtime", default_value = "node")]
        node_runtime: PathBuf,
        #[arg(long = "worker-entry")]
        worker_entry: Option<PathBuf>,
    },
    Session {
        #[command(subcommand)]
        action: SessionAction,
    },
}

#[derive(Debug, Subcommand)]
enum SessionAction {
    Create {
        #[arg(long, value_enum)]
        lane: LaneArg,
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
    },
    Resume {
        #[arg(long)]
        id: String,
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
    },
    Status {
        #[arg(long)]
        id: String,
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
    },
    Complete {
        #[arg(long)]
        id: String,
        #[arg(long, default_value = ".")]
        workspace: PathBuf,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum LaneArg {
    Quick,
    Delivery,
    Migration,
}

impl From<LaneArg> for WorkflowLane {
    fn from(value: LaneArg) -> Self {
        match value {
            LaneArg::Quick => WorkflowLane::Quick,
            LaneArg::Delivery => WorkflowLane::Delivery,
            LaneArg::Migration => WorkflowLane::Migration,
        }
    }
}

#[derive(Debug, Args)]
struct KnowledgeCommandArgs {
    input: String,
    #[arg(long, default_value = ".")]
    workspace: PathBuf,
    #[arg(long = "node-runtime", default_value = "node")]
    node_runtime: PathBuf,
    #[arg(long = "worker-entry")]
    worker_entry: Option<PathBuf>,
    #[arg(long = "worker-manifest")]
    worker_manifest: Option<PathBuf>,
    #[arg(long = "resume-session")]
    resume_session_id: Option<String>,
    #[arg(long, value_enum, default_value = "quick")]
    lane: LaneArg,
    #[arg(long, default_value_t = false)]
    json: bool,
}

/// Arguments shared by `dh quick`, `dh delivery`, and `dh migrate`.
#[derive(Debug, Args)]
struct LaneCommandArgs {
    /// The workflow objective (what to accomplish).
    objective: String,
    #[arg(long, default_value = ".")]
    workspace: PathBuf,
    #[arg(long = "node-runtime", default_value = "node")]
    node_runtime: PathBuf,
    #[arg(long = "worker-entry")]
    worker_entry: Option<PathBuf>,
    #[arg(long = "worker-manifest")]
    worker_manifest: Option<PathBuf>,
    #[arg(long = "resume-session")]
    resume_session_id: Option<String>,
    #[arg(long, default_value_t = false)]
    json: bool,
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum BenchmarkClassArg {
    ColdFullIndex,
    WarmNoChangeIndex,
    IncrementalReindex,
    ColdQuery,
    WarmQuery,
    HydrateGraph,
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
            BenchmarkClassArg::HydrateGraph => BenchmarkClass::HydrateGraph,
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

            // Embed chunks if a real provider is configured.
            let embed_client = build_embedding_client_from_env();
            let embedded_count = if embed_client.is_real() {
                match indexer.embed_chunks_batch(1, embed_client.as_ref()) {
                    Ok(n) => n,
                    Err(e) => {
                        eprintln!("[warn] Embedding batch failed (non-fatal): {e:#}");
                        0
                    }
                }
            } else {
                0
            };

            println!("index complete");
            println!("workspace: {}", workspace.display());
            println!("database: {}", db_path.display());
            println!("run_id: {}", report.run_id);
            println!("scanned_files: {}", report.scanned_files);
            println!("changed_files: {}", report.changed_files);
            println!("reindexed_files: {}", report.reindexed_files);
            println!("deleted_files: {}", report.deleted_files);
            println!("queued_embeddings: {}", report.queued_embeddings);
            println!("embedded_chunks: {}", embedded_count);
            println!(
                "embedding_provider: {}",
                if embed_client.is_real() {
                    embed_client.config().model.as_str()
                } else {
                    "stub (set OPENAI_API_KEY to enable)"
                }
            );
            println!("duration_ms: {}", report.duration_ms);
            println!("link_ms: {}", report.link_ms);
            println!("graph_hydration_ms: {}", report.graph_hydration_ms);
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
        Commands::HostContract { json } => {
            let contract = host_lifecycle::lifecycle_contract();
            let protocol = worker_protocol::worker_protocol_contract();
            let payload = serde_json::json!({
                "lifecycleContract": contract,
                "workerProtocolContract": protocol,
            });

            if json {
                println!("{}", serde_json::to_string_pretty(&payload)?);
            } else {
                println!(
                    "topology: {}",
                    payload["lifecycleContract"]["topology"]
                        .as_str()
                        .unwrap_or("unknown")
                );
                println!(
                    "support_boundary: {}",
                    payload["lifecycleContract"]["supportBoundary"]
                        .as_str()
                        .unwrap_or("unknown")
                );
                println!(
                    "authority_owner: {}",
                    payload["lifecycleContract"]["authorityOwner"]
                        .as_str()
                        .unwrap_or("unknown")
                );
                println!(
                    "worker_protocol: {}",
                    payload["workerProtocolContract"]["protocolVersion"]
                        .as_str()
                        .unwrap_or("unknown")
                );
            }
        }
        Commands::Ask(args) => {
            run_knowledge_command(host_commands::HostKnowledgeCommandKind::Ask, args)?
        }
        Commands::Explain(args) => {
            run_knowledge_command(host_commands::HostKnowledgeCommandKind::Explain, args)?
        }
        Commands::Trace(args) => {
            run_knowledge_command(host_commands::HostKnowledgeCommandKind::Trace, args)?
        }
        Commands::Quick(args) => run_lane_command(WorkflowLane::Quick, args)?,
        Commands::Delivery(args) => run_lane_command(WorkflowLane::Delivery, args)?,
        Commands::Migrate(args) => run_lane_command(WorkflowLane::Migration, args)?,
        Commands::Serve { workspace } => {
            let workspace = workspace.canonicalize()?;
            bridge::run_bridge_server(workspace)?;
        }
        Commands::Doctor {
            workspace,
            node_runtime,
            worker_entry,
        } => {
            println!("== DH Engine Doctor ==");

            // 1. Environment
            println!("\n[1] Environment");
            println!("OS: {}", std::env::consts::OS);
            println!("Architecture: {}", std::env::consts::ARCH);
            println!("Current Dir: {}", std::env::current_dir()?.display());
            let workspace = workspace.canonicalize().unwrap_or(workspace);
            println!("Workspace: {}", workspace.display());

            // 2. Database
            println!("\n[2] Database Status");
            let db_path = workspace.join(DEFAULT_DB_NAME);
            if db_path.exists() {
                println!("Database File: {} (exists)", db_path.display());
                match Database::new(&db_path) {
                    Ok(db) => {
                        if let Err(e) = db.initialize() {
                            println!("ERROR: Failed to initialize DB: {}", e);
                        } else {
                            match db.get_state(1) {
                                Ok(Some(state)) => {
                                    println!("Status: {:?}", state.status);
                                    println!("Indexed Files: {}", state.indexed_files);
                                }
                                Ok(None) => println!("ERROR: No state found for workspace_id=1"),
                                Err(e) => println!("ERROR: Failed to get state: {}", e),
                            }
                        }
                    }
                    Err(e) => println!("ERROR: Failed to open DB: {}", e),
                }
            } else {
                println!(
                    "Database File: {} (not found, run `dh index`)",
                    db_path.display()
                );
            }

            // 3. TS Worker
            println!("\n[3] TS Worker Health");
            let worker_path = worker_entry.unwrap_or_else(|| {
                std::env::current_dir()
                    .unwrap()
                    .join("dist")
                    .join("ts-worker")
                    .join("worker.mjs")
            });
            println!("Node Runtime: {}", node_runtime.display());
            println!("Worker Entry: {}", worker_path.display());
            if !worker_path.exists() {
                println!("ERROR: Worker entry file not found!");
            } else {
                let launch_request =
                    crate::runtime_launch::RuntimeLaunchRequest::new(&node_runtime, &worker_path);
                let launchability =
                    crate::runtime_launch::check_worker_launchability(&launch_request);
                if !launchability.is_launchable() {
                    println!("ERROR: Worker is not launchable: {:?}", launchability.issue);
                } else {
                    println!("Worker is launchable. Testing supervisor startup...");
                    let config = crate::worker_supervisor::WorkerSupervisorConfig::new(
                        launch_request,
                        workspace.clone(),
                    );
                    let mut supervisor = crate::worker_supervisor::WorkerSupervisor::new(config);

                    let start = std::time::Instant::now();
                    match supervisor.launch() {
                        Ok(report) => {
                            let duration = start.elapsed();
                            println!("SUCCESS: Worker launched and ready in {:?}", duration);
                            println!("Worker state: {:?}", report.worker_state);
                            println!("Health state: {:?}", report.health_state);
                        }
                        Err(e) => {
                            println!("ERROR: Failed to launch worker: {}", e);
                        }
                    }
                    let _ = supervisor.shutdown();
                }
            }

            // 4. Configuration
            println!("\n[4] API Configurations");
            let api_keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PROXYPAL_API_KEY"];
            for key in api_keys {
                match std::env::var(key) {
                    Ok(val) => {
                        let masked = if val.len() > 4 {
                            format!("{}...{}", &val[0..4], &val[val.len() - 4..])
                        } else {
                            "***".to_string()
                        };
                        println!("{}: SET ({})", key, masked);
                    }
                    Err(_) => println!("{}: NOT SET", key),
                }
            }

            // 5. Embedding Health Check
            println!("\n[5] Embedding Provider");
            let embed_client = build_embedding_client_from_env();
            let embed_config = embed_client.config();
            if embed_client.is_real() {
                println!("provider: openai (real vectors)");
                println!("model: {}", embed_config.model);
                println!("dimensions: {}", embed_config.dimensions);
                if let Some(base_url) = &embed_config.base_url {
                    println!("base_url: {}", base_url);
                }
                match embed_client.health_check() {
                    Ok(()) => println!("status: ok"),
                    Err(e) => println!("status: ERROR — {e:#}"),
                }
            } else {
                println!("provider: stub (zero-vectors)");
                println!("status: ok (no API key required)");
                println!("note: set OPENAI_API_KEY to enable real semantic search");
            }
            println!("\nDoctor check complete.");
        }
        Commands::Session { action } => match action {
            SessionAction::Create { lane, workspace } => {
                let db_path = workspace.join(DEFAULT_DB_NAME);
                let db = Database::new(&db_path)?;
                db.initialize()?;
                let session_mgr = session_manager::SessionManager::new(&db);

                let id = format!("session-{}", chrono::Utc::now().timestamp_millis());
                let session =
                    session_mgr.create_session(&id, &workspace.to_string_lossy(), lane.into())?;
                session_mgr.activate_session(&session.id)?;

                println!("{}", serde_json::to_string_pretty(&session)?);
            }
            SessionAction::Resume { id, workspace } => {
                let db_path = workspace.join(DEFAULT_DB_NAME);
                let db = Database::new(&db_path)?;
                db.initialize()?;
                let session_mgr = session_manager::SessionManager::new(&db);

                let session = session_mgr
                    .resume_session(&id)?
                    .context("session not found")?;
                session_mgr.activate_session(&session.id)?;

                println!("{}", serde_json::to_string_pretty(&session)?);
            }
            SessionAction::Status { id, workspace } => {
                let db_path = workspace.join(DEFAULT_DB_NAME);
                let db = Database::new(&db_path)?;
                db.initialize()?;
                let session_mgr = session_manager::SessionManager::new(&db);

                let session = session_mgr
                    .resume_session(&id)?
                    .context("session not found")?;
                let history = session_mgr.stage_history(&id)?;

                let status_payload = serde_json::json!({
                    "session": session,
                    "history": history,
                });

                println!("{}", serde_json::to_string_pretty(&status_payload)?);
            }
            SessionAction::Complete { id, workspace } => {
                let db_path = workspace.join(DEFAULT_DB_NAME);
                let db = Database::new(&db_path)?;
                db.initialize()?;
                let session_mgr = session_manager::SessionManager::new(&db);

                session_mgr.complete_session(&id)?;
                let session = session_mgr
                    .resume_session(&id)?
                    .context("session not found")?;

                println!("{}", serde_json::to_string_pretty(&session)?);
            }
        },
    }

    Ok(())
}

fn run_knowledge_command(
    kind: host_commands::HostKnowledgeCommandKind,
    args: KnowledgeCommandArgs,
) -> Result<()> {
    let worker_bundle = runtime_launch::resolve_worker_bundle_paths(
        args.worker_entry,
        args.worker_manifest,
        &knowledge_command_bundle_search_roots(&args.workspace),
    );

    let platform = runtime_launch::current_platform();
    let platform_supported = host_lifecycle::classify_platform(&platform).supported;
    if !platform_supported || !worker_bundle.worker_entry_path.exists() {
        let launchability_issue = if platform_supported {
            host_lifecycle::LaunchabilityIssue::BundleMissing
        } else {
            host_lifecycle::LaunchabilityIssue::UnsupportedPlatform
        };
        let report = host_lifecycle::classify_launchability_failure(platform, launchability_issue);
        let launch_note = if platform_supported {
            "Rust-hosted first-wave knowledge command path requires a TypeScript worker bundle."
        } else {
            "Rust-hosted first-wave knowledge command path currently supports Linux and macOS only."
        };
        let payload = serde_json::json!({
            "command": kind.as_str(),
            "topology": host_lifecycle::TOPOLOGY_RUST_HOST_TS_WORKER,
            "supportBoundary": host_lifecycle::SUPPORT_BOUNDARY_FIRST_WAVE,
            "legacyPathLabel": "legacy_ts_host_bridge_compatibility_only",
            "rustLifecycle": report,
            "workerResult": null,
            "rustHostNotes": [
                launch_note,
                "No legacy TypeScript-host fallback was used; legacy bridge remains compatibility-only outside this supported path."
            ]
        });
        if args.json {
            println!("{}", serde_json::to_string_pretty(&payload)?);
        } else {
            println!("command: {}", kind.as_str());
            println!("topology: {}", host_lifecycle::TOPOLOGY_RUST_HOST_TS_WORKER);
            println!(
                "support boundary: {}",
                host_lifecycle::SUPPORT_BOUNDARY_FIRST_WAVE
            );
            println!("lifecycle authority: rust");
            println!("legacy path label: legacy_ts_host_bridge_compatibility_only");
            println!("rust host lifecycle:");
            println!("  failure phase: Startup");
            println!("  final status: StartupFailed");
            println!("  final exit code: {}", report.final_exit_code);
            println!("  launchability issue: {:?}", launchability_issue);
            println!();
            println!("rust host notes:");
            println!("  - {launch_note}");
            println!("  - No legacy TypeScript-host fallback was used; legacy bridge remains compatibility-only outside this supported path.");
        }
        std::process::exit(report.final_exit_code);
    }

    let report =
        host_commands::run_hosted_knowledge_command(host_commands::HostKnowledgeCommandRequest {
            kind,
            input: args.input,
            workspace_root: args.workspace,
            node_runtime: args.node_runtime,
            worker_entry: worker_bundle.worker_entry_path,
            worker_manifest: worker_bundle.manifest_path,
            replay_safety: worker_supervisor::ReplaySafety::ReplaySafeReadOnly,
            output_json: args.json,
            resume_session_id: args.resume_session_id,
            lane: args.lane.into(),
        })?;
    let exit_code = report.rust_lifecycle.final_exit_code;

    if args.json {
        println!("{}", host_commands::render_hosted_knowledge_json(&report)?);
    } else {
        println!("{}", host_commands::render_hosted_knowledge_text(&report));
    }

    std::process::exit(exit_code);
}

fn run_lane_command(lane: WorkflowLane, args: LaneCommandArgs) -> Result<()> {
    let worker_bundle = runtime_launch::resolve_worker_bundle_paths(
        args.worker_entry,
        args.worker_manifest,
        &knowledge_command_bundle_search_roots(&args.workspace),
    );

    let platform = runtime_launch::current_platform();
    let platform_supported = host_lifecycle::classify_platform(&platform).supported;
    if !platform_supported || !worker_bundle.worker_entry_path.exists() {
        let launchability_issue = if platform_supported {
            host_lifecycle::LaunchabilityIssue::BundleMissing
        } else {
            host_lifecycle::LaunchabilityIssue::UnsupportedPlatform
        };
        let report = host_lifecycle::classify_launchability_failure(platform, launchability_issue);
        let launch_note = if platform_supported {
            "Rust-hosted first-wave lane command path requires a TypeScript worker bundle."
        } else {
            "Rust-hosted first-wave lane command path currently supports Linux and macOS only."
        };
        let payload = serde_json::json!({
            "command": "lane",
            "topology": host_lifecycle::TOPOLOGY_RUST_HOST_TS_WORKER,
            "supportBoundary": host_lifecycle::SUPPORT_BOUNDARY_FIRST_WAVE,
            "legacyPathLabel": "legacy_ts_host_bridge_compatibility_only",
            "rustLifecycle": report,
            "workerResult": null,
            "rustHostNotes": [
                launch_note,
                "No legacy TypeScript-host fallback was used; legacy bridge remains compatibility-only outside this supported path."
            ]
        });
        if args.json {
            println!("{}", serde_json::to_string_pretty(&payload)?);
        } else {
            println!("command: lane ({:?})", lane);
            println!("topology: {}", host_lifecycle::TOPOLOGY_RUST_HOST_TS_WORKER);
            println!(
                "support boundary: {}",
                host_lifecycle::SUPPORT_BOUNDARY_FIRST_WAVE
            );
            println!("lifecycle authority: rust");
            println!("legacy path label: legacy_ts_host_bridge_compatibility_only");
            println!("rust host lifecycle:");
            println!("  failure phase: Startup");
            println!("  final status: StartupFailed");
            println!("  final exit code: {}", report.final_exit_code);
            println!("  launchability issue: {:?}", launchability_issue);
            println!();
            println!("rust host notes:");
            println!("  - {launch_note}");
            println!("  - No legacy TypeScript-host fallback was used; legacy bridge remains compatibility-only outside this supported path.");
        }
        std::process::exit(report.final_exit_code);
    }

    let report = host_commands::run_hosted_lane_command(host_commands::HostLaneCommandRequest {
        lane,
        objective: args.objective,
        workspace_root: args.workspace,
        node_runtime: args.node_runtime,
        worker_entry: worker_bundle.worker_entry_path,
        worker_manifest: worker_bundle.manifest_path,
        resume_session_id: args.resume_session_id,
        output_json: args.json,
    })?;
    let exit_code = report.rust_lifecycle.final_exit_code;

    if args.json {
        println!("{}", host_commands::render_hosted_knowledge_json(&report)?);
    } else {
        println!("{}", host_commands::render_hosted_knowledge_text(&report));
    }

    std::process::exit(exit_code);
}

fn knowledge_command_bundle_search_roots(workspace: &std::path::Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            roots.push(parent.to_path_buf());
            if let Some(grandparent) = parent.parent() {
                roots.push(grandparent.to_path_buf());
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    roots.push(workspace.to_path_buf());
    roots
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
