use anyhow::{Context, Result};
use dh_graph::HydratedGraphProjection;
use dh_indexer::parity::{ParityCaseResult, ParityHarness};
use dh_indexer::{IndexReport, IndexWorkspaceRequest, Indexer, IndexerApi};
use dh_query::{FindSymbolQuery, QueryEngine};
use dh_storage::{Database, SymbolRepository};
use dh_types::{
    BenchmarkClass, BenchmarkComparison, BenchmarkCorpusKind, BenchmarkCorpusRef,
    BenchmarkPreparationState, BenchmarkResult, BenchmarkResultStatus, BenchmarkRunMetadata,
    BenchmarkSuiteArtifact, BenchmarkSummary, BridgeCodecBenchmarkMetrics, GraphHydrationBenchmarkMetrics,
    IndexBenchmarkMetrics, MemoryMeasurement, MemoryMeasurementStatus, ParityBenchmarkMetrics,
    QueryLatencyMetrics, WorkspaceId,
};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::Instant;

const BENCHMARK_SCHEMA_VERSION: u32 = 1;
const HYDRATE_SAMPLE_COUNT: u32 = 5;

#[derive(Debug, Clone)]
pub struct BenchmarkRunRequest {
    pub class: BenchmarkClass,
    pub workspace: std::path::PathBuf,
}

#[derive(Debug, Serialize)]
pub struct BenchmarkRunResponse {
    pub artifact: BenchmarkSuiteArtifact,
}

pub fn run_benchmark(request: BenchmarkRunRequest) -> Result<BenchmarkRunResponse> {
    match request.class {
        BenchmarkClass::ParityBenchmark => {
            let fixture_root = request.workspace.canonicalize().with_context(|| {
                format!(
                    "canonicalize parity fixture workspace {}",
                    request.workspace.display()
                )
            })?;
            let harness = ParityHarness::new(fixture_root.clone());
            let report = harness.run()?;
            Ok(BenchmarkRunResponse {
                artifact: parity_report_to_artifact(&report, &fixture_root),
            })
        }
        BenchmarkClass::BridgeCodec => Ok(BenchmarkRunResponse {
            artifact: run_bridge_codec_benchmark(&request.workspace),
        }),
        BenchmarkClass::ColdFullIndex
        | BenchmarkClass::WarmNoChangeIndex
        | BenchmarkClass::IncrementalReindex => {
            let workspace = request.workspace.canonicalize().with_context(|| {
                format!(
                    "canonicalize index benchmark workspace {}",
                    request.workspace.display()
                )
            })?;
            let db_path = workspace.join("dh-index.db");
            let indexer = Indexer::new(db_path);
            let artifact = run_index_benchmark(request.class, &workspace, &indexer)?;
            Ok(BenchmarkRunResponse { artifact })
        }
        BenchmarkClass::HydrateGraph => {
            let workspace = request.workspace.canonicalize().with_context(|| {
                format!(
                    "canonicalize hydrate benchmark workspace {}",
                    request.workspace.display()
                )
            })?;
            let db_path = workspace.join("dh-index.db");
            let indexer = Indexer::new(db_path.clone());

            let report = indexer.index_workspace(IndexWorkspaceRequest {
                roots: vec![workspace.clone()],
                force_full: false,
                max_files: None,
                include_embeddings: false,
            })?;

            let db = Database::new(&db_path)
                .with_context(|| format!("open db {} for hydrate benchmark", db_path.display()))?;
            db.initialize()?;

            let artifact = run_hydrate_benchmark(&workspace, &db, &report)?;
            Ok(BenchmarkRunResponse { artifact })
        }
        BenchmarkClass::ColdQuery | BenchmarkClass::WarmQuery => {
            let workspace = request.workspace.canonicalize().with_context(|| {
                format!(
                    "canonicalize query benchmark workspace {}",
                    request.workspace.display()
                )
            })?;
            let db_path = workspace.join("dh-index.db");
            let indexer = Indexer::new(db_path.clone());

            // Ensure benchmark query set is built against a current local index snapshot.
            indexer.index_workspace(IndexWorkspaceRequest {
                roots: vec![workspace.clone()],
                force_full: false,
                max_files: None,
                include_embeddings: false,
            })?;

            let db = Database::new(&db_path)
                .with_context(|| format!("open db {} for query benchmark", db_path.display()))?;
            db.initialize()?;

            let artifact = run_query_benchmark(request.class, &workspace, &db)?;
            Ok(BenchmarkRunResponse { artifact })
        }
    }
}

pub fn write_suite_json(artifact: &BenchmarkSuiteArtifact, output_path: &Path) -> Result<()> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create benchmark parent directory {}", parent.display()))?;
    }

    let json =
        serde_json::to_string_pretty(artifact).context("serialize benchmark artifact as JSON")?;
    fs::write(output_path, json)
        .with_context(|| format!("write benchmark artifact JSON {}", output_path.display()))?;
    Ok(())
}

pub fn benchmark_summary_lines(artifact: &BenchmarkSuiteArtifact) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push("Benchmark summary".to_string());
    lines.push(format!(
        "scope: {}",
        artifact.summary.local_evidence_statement
    ));
    lines.push(format!("corpus: {}", artifact.summary.corpus_summary));
    lines.push(format!(
        "environment: {}",
        artifact.summary.environment_summary
    ));
    lines.push(format!(
        "suite_status: {}",
        if artifact.summary.degraded {
            "degraded"
        } else {
            "complete"
        }
    ));
    lines.push(format!("result_count: {}", artifact.summary.result_count));

    for result in &artifact.results {
        lines.push(format!(
            "- class={} status={} corpus={}@{}",
            benchmark_class_label(result.metadata.benchmark_class),
            benchmark_status_label(result.status),
            result.metadata.corpus.label,
            result.metadata.corpus.revision_or_snapshot
        ));

        if let Some(correctness) = &result.correctness {
            lines.push(format!(
                "  correctness: total={} passed={} failed={} symbol_parity={:.2}% import_parity={:.2}% call_edge_parity={:.2}% reference_parity={:.2}% chunk_parity={:.2}%",
                correctness.total_cases,
                correctness.passed_cases,
                correctness.failed_cases,
                correctness.symbol_parity_pct,
                correctness.import_parity_pct,
                correctness.call_edge_parity_pct,
                correctness.reference_parity_pct,
                correctness.chunk_parity_pct
            ));
        }

        if let Some(index) = &result.index_timing {
            lines.push(format!(
                "  index_timing_ms: elapsed={:.3} link={:.3} graph_hydration={:.3} scanned={} changed={} reindexed={} deleted={} refreshed={} retained={} degraded={} not_current={}",
                index.elapsed_ms,
                index.link_ms,
                index.graph_hydration_ms,
                index.scanned_files,
                index.changed_files,
                index.reindexed_files,
                index.deleted_files,
                index.refreshed_current_files,
                index.retained_current_files,
                index.degraded_partial_files,
                index.not_current_files
            ));
        }

        if let Some(hydration) = &result.graph_hydration {
            lines.push(format!(
                "  graph_hydration_ms: samples_requested={} samples_completed={} p50={:.3} p95={:.3} max={:.3} nodes={} persisted_edges={} synthetic_edges={} freshness={}",
                hydration.sample_count_requested,
                hydration.sample_count_completed,
                hydration.p50_ms,
                hydration.p95_ms,
                hydration.max_ms,
                hydration.node_count,
                hydration.persisted_edge_count,
                hydration.synthetic_edge_count,
                hydration.freshness
            ));
            lines.push(format!(
                "  graph_hydration_freshness_reason: {}",
                hydration.freshness_reason
            ));
        }

        if let Some(latency) = &result.query_latency {
            lines.push(format!(
                "  query_latency_ms: samples_requested={} samples_completed={} p50={:.3} p95={:.3} query_set={}",
                latency.sample_count_requested,
                latency.sample_count_completed,
                latency.p50_ms,
                latency.p95_ms,
                latency.query_set_label
            ));
        }

        if let Some(bridge) = &result.bridge_codec {
            lines.push(format!(
                "  bridge_codec: payload={} selected_codec={} samples={} json_bytes={} msgpack_bytes={} json_encode_ms={:.3} json_decode_ms={:.3} msgpack_encode_ms={:.3} msgpack_decode_ms={:.3} encode_speedup={:.2}x decode_speedup={:.2}x improvement_class={} target_5_10x_status={}",
                bridge.payload_label,
                bridge.selected_codec,
                bridge.sample_count_completed,
                bridge.json_bytes,
                bridge.msgpack_bytes,
                bridge.json_encode_ms,
                bridge.json_decode_ms,
                bridge.msgpack_encode_ms,
                bridge.msgpack_decode_ms,
                bridge.encode_speedup,
                bridge.decode_speedup,
                bridge.improvement_classification,
                bridge.target_5_10x_status
            ));
        }

        lines.push(memory_line(&result.memory));

        if !result.degradation_notes.is_empty() {
            for note in &result.degradation_notes {
                lines.push(format!("  degraded_note: {}", note));
            }
        }
    }

    lines
}

fn run_index_benchmark(
    class: BenchmarkClass,
    workspace: &Path,
    indexer: &Indexer,
) -> Result<BenchmarkSuiteArtifact> {
    let workspace_display = workspace.to_string_lossy().to_string();
    let prepared_state = workspace.join("dh-index.db").exists();

    let mut incremental_baseline_run_ref: Option<String> = None;
    let mut incremental_baseline_prep_elapsed_ms: Option<f64> = None;

    let (report, started, finished, elapsed_ms) = if class == BenchmarkClass::IncrementalReindex {
        // Incremental benchmark runs have two phases:
        // 1) baseline preparation run (metadata-only timing)
        // 2) measured rerun (authoritative elapsed_ms)
        let baseline_prep_started = now_unix_ms();
        let baseline_prep_instant = Instant::now();
        let baseline_report = indexer.index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })?;
        let _baseline_prep_finished = now_unix_ms();
        incremental_baseline_run_ref = Some(baseline_report.run_id);
        incremental_baseline_prep_elapsed_ms =
            Some(baseline_prep_instant.elapsed().as_secs_f64() * 1000.0);

        let measured_started = now_unix_ms();
        let measured_instant = Instant::now();
        let measured_report = indexer.index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full: false,
            max_files: None,
            include_embeddings: false,
        })?;
        let measured_finished = now_unix_ms();
        let measured_elapsed_ms = measured_instant.elapsed().as_secs_f64() * 1000.0;

        // Keep variable intentionally used to make baseline prep phase explicit and inspectable.
        let _ = baseline_prep_started;

        (
            measured_report,
            measured_started,
            measured_finished,
            measured_elapsed_ms,
        )
    } else {
        let force_full = class == BenchmarkClass::ColdFullIndex;
        let started = now_unix_ms();
        let started_instant = Instant::now();
        let report = indexer.index_workspace(IndexWorkspaceRequest {
            roots: vec![workspace.to_path_buf()],
            force_full,
            max_files: None,
            include_embeddings: false,
        })?;
        let finished = now_unix_ms();
        let elapsed_ms = started_instant.elapsed().as_secs_f64() * 1000.0;
        (report, started, finished, elapsed_ms)
    };

    let corpus = BenchmarkCorpusRef {
        kind: BenchmarkCorpusKind::DhRepo,
        label: workspace
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_string(),
        revision_or_snapshot: "local-working-tree".to_string(),
        root_path: workspace_display,
        query_set_label: None,
        mutation_set_label: if class == BenchmarkClass::IncrementalReindex {
            Some("unchanged_corpus_reindex".to_string())
        } else {
            None
        },
        notes: Some(
            "Local benchmark evidence only; results are corpus-bound and environment-bound."
                .to_string(),
        ),
    };

    let preparation = index_preparation_state(
        class,
        prepared_state,
        report.run_id.as_str(),
        incremental_baseline_run_ref.as_deref(),
        incremental_baseline_prep_elapsed_ms,
    );

    let comparison_key = Some(comparison_key_for(
        class,
        &corpus,
        profile_name(),
        &preparation,
    ));

    let warm_without_baseline = class == BenchmarkClass::WarmNoChangeIndex && !prepared_state;
    let warm_no_change_has_mutations =
        class == BenchmarkClass::WarmNoChangeIndex && report.changed_files > 0;
    let incremental_without_mutation = class == BenchmarkClass::IncrementalReindex;
    let incremental_missing_baseline_run_ref =
        class == BenchmarkClass::IncrementalReindex && incremental_baseline_run_ref.is_none();
    let incremental_invalid_baseline_linkage = class == BenchmarkClass::IncrementalReindex
        && incremental_baseline_run_ref
            .as_deref()
            .is_some_and(|run_ref| run_ref == report.run_id);

    let mut degradation_notes = Vec::new();
    if report.not_current_files > 0 {
        degradation_notes.push(
            "One or more files were marked not_current during this benchmark run.".to_string(),
        );
        degradation_notes.push(
            "Result remains local evidence and should not be compared as full healthy-run equivalence."
                .to_string(),
        );
    }
    if warm_without_baseline {
        degradation_notes.push(
            "warm_no_change_index requested without pre-existing reusable local state; this run establishes local state but does not prove prior warm baseline reuse."
                .to_string(),
        );
    }
    if warm_no_change_has_mutations {
        degradation_notes.push(format!(
            "warm_no_change_index detected changed_files={} and cannot be marked complete no-change evidence.",
            report.changed_files
        ));
    }
    if incremental_without_mutation {
        degradation_notes.push(
            "incremental_reindex currently uses explicit mutation_set_label=none; treat this as bounded no-mutation incremental evidence, not changed-mutation performance proof."
                .to_string(),
        );
    }
    if incremental_missing_baseline_run_ref {
        degradation_notes.push(
            "incremental_reindex baseline linkage is missing; baseline_run_ref could not be captured from the preparation run."
                .to_string(),
        );
    }
    if incremental_invalid_baseline_linkage {
        degradation_notes.push(
            "incremental_reindex baseline_run_ref matched measured run_id; comparison linkage is invalid."
                .to_string(),
        );
    }

    let comparison_eligible = match class {
        BenchmarkClass::IncrementalReindex => false,
        BenchmarkClass::WarmNoChangeIndex => !warm_no_change_has_mutations,
        _ => true,
    };

    let comparison_reason = match class {
        BenchmarkClass::IncrementalReindex => Some(
            "Incremental class comparison requires explicit baseline run pairing per mutation set."
                .to_string(),
        ),
        BenchmarkClass::WarmNoChangeIndex if warm_no_change_has_mutations => Some(
            "warm_no_change_index comparison is not eligible when rerun observes changed files."
                .to_string(),
        ),
        _ => None,
    };

    let result = BenchmarkResult {
        metadata: BenchmarkRunMetadata {
            run_id: report.run_id.clone(),
            benchmark_class: class,
            suite_id: format!("benchmark-suite-{}", report.run_id),
            started_at_unix_ms: started,
            finished_at_unix_ms: finished,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            build_profile: profile_name(),
            host_os: std::env::consts::OS.to_string(),
            host_arch: std::env::consts::ARCH.to_string(),
            cpu_count: std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1),
            corpus: corpus.clone(),
            preparation: preparation.clone(),
            baseline_run_ref: if class == BenchmarkClass::IncrementalReindex {
                incremental_baseline_run_ref.clone()
            } else {
                None
            },
            comparison_key: comparison_key.clone(),
        },
        status: if report.not_current_files > 0
            || warm_without_baseline
            || warm_no_change_has_mutations
            || incremental_without_mutation
            || incremental_missing_baseline_run_ref
            || incremental_invalid_baseline_linkage
        {
            BenchmarkResultStatus::Degraded
        } else {
            BenchmarkResultStatus::Complete
        },
        memory: MemoryMeasurement {
            status: MemoryMeasurementStatus::NotMeasured,
            peak_rss_bytes: None,
            method: None,
            scope: Some("index_run_process".to_string()),
            reason: Some(
                "Peak RSS measurement is not yet instrumented for index benchmark classes."
                    .to_string(),
            ),
        },
        comparison: BenchmarkComparison {
            eligible: comparison_eligible,
            baseline_run_ref: if class == BenchmarkClass::IncrementalReindex {
                incremental_baseline_run_ref
            } else {
                None
            },
            comparison_key,
            reason: comparison_reason,
        },
        correctness: None,
        index_timing: Some(IndexBenchmarkMetrics {
            elapsed_ms,
            link_ms: report.link_ms as f64,
            graph_hydration_ms: report.graph_hydration_ms as f64,
            scanned_files: report.scanned_files,
            changed_files: report.changed_files,
            reindexed_files: report.reindexed_files,
            deleted_files: report.deleted_files,
            refreshed_current_files: report.refreshed_current_files,
            retained_current_files: report.retained_current_files,
            degraded_partial_files: report.degraded_partial_files,
            not_current_files: report.not_current_files,
        }),
        query_latency: None,
        graph_hydration: None,
        bridge_codec: None,
        degradation_notes,
    };

    let summary = BenchmarkSummary {
        local_evidence_statement:
            "Benchmark results are local evidence for this corpus and this environment only."
                .to_string(),
        corpus_summary: format!(
            "{}@{} ({:?})",
            corpus.label, corpus.revision_or_snapshot, corpus.kind
        ),
        environment_summary: format!(
            "{}-{} build_profile={}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            profile_name()
        ),
        degraded: matches!(result.status, BenchmarkResultStatus::Degraded),
        result_count: 1,
    };

    Ok(BenchmarkSuiteArtifact {
        schema_version: BENCHMARK_SCHEMA_VERSION,
        suite_id: result.metadata.suite_id.clone(),
        generated_at_unix_ms: now_unix_ms(),
        summary,
        results: vec![result],
    })
}

fn run_query_benchmark(
    class: BenchmarkClass,
    workspace: &Path,
    db: &Database,
) -> Result<BenchmarkSuiteArtifact> {
    let benchmark_set = benchmark_query_set(db)?;
    if benchmark_set.cases.is_empty() {
        anyhow::bail!(
            "query benchmark requires indexed symbols; no benchmarkable symbol cases were found"
        );
    }

    let run_id = format!("query-benchmark-{}", now_unix_ms());
    let suite_id = format!("benchmark-suite-{run_id}");
    let started = now_unix_ms();

    let warmup_enabled = matches!(class, BenchmarkClass::WarmQuery);
    if warmup_enabled {
        for query_case in &benchmark_set.cases {
            let _ = db.find_symbol(FindSymbolQuery {
                workspace_id: 1,
                name: query_case.symbol_name.clone(),
                kinds: None,
                file_hint: None,
                namespace_hint: None,
                include_external: false,
                limit: 5,
            })?;
        }
    }

    let sample_count_requested = benchmark_set.sample_count_requested;
    let mut timings = Vec::new();
    for _ in 0..sample_count_requested {
        for query_case in &benchmark_set.cases {
            let sample_start = Instant::now();
            let _ = db.find_symbol(FindSymbolQuery {
                workspace_id: 1,
                name: query_case.symbol_name.clone(),
                kinds: None,
                file_hint: None,
                namespace_hint: None,
                include_external: false,
                limit: 5,
            })?;
            timings.push(sample_start.elapsed().as_secs_f64() * 1000.0);
        }
    }

    let finished = now_unix_ms();
    let sample_count_completed = timings.len() as u32;
    let p50_ms = percentile(&timings, 50.0);
    let p95_ms = percentile(&timings, 95.0);

    let query_set_label = benchmark_set.label.clone();
    let corpus = BenchmarkCorpusRef {
        kind: BenchmarkCorpusKind::DhRepo,
        label: workspace
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_string(),
        revision_or_snapshot: "local-working-tree".to_string(),
        root_path: workspace.to_string_lossy().to_string(),
        query_set_label: Some(query_set_label.clone()),
        mutation_set_label: None,
        notes: Some(
            "Bounded Rust query-engine latency only; does not measure CLI startup, bridge, or LLM latency."
                .to_string(),
        ),
    };

    let preparation = BenchmarkPreparationState {
        state_label: if warmup_enabled {
            "warm_query_prepared_state"
        } else {
            "cold_query_no_warmup"
        }
        .to_string(),
        cleared_reusable_state: Some(!warmup_enabled),
        preserved_reusable_state: Some(warmup_enabled),
        baseline_run_ref: None,
        mutation_set_label: None,
        mutation_paths: Vec::new(),
        query_set_label: Some(query_set_label.clone()),
        notes: vec![
            "Query benchmark latency is reported as sample distribution (p50/p95) and sample counts."
                .to_string(),
            "This benchmark is local evidence only and does not imply end-to-end answer latency guarantees."
                .to_string(),
        ],
    };

    let comparison_key = Some(comparison_key_for(
        class,
        &corpus,
        profile_name(),
        &preparation,
    ));

    let result = BenchmarkResult {
        metadata: BenchmarkRunMetadata {
            run_id,
            benchmark_class: class,
            suite_id: suite_id.clone(),
            started_at_unix_ms: started,
            finished_at_unix_ms: finished,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            build_profile: profile_name(),
            host_os: std::env::consts::OS.to_string(),
            host_arch: std::env::consts::ARCH.to_string(),
            cpu_count: std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1),
            corpus: corpus.clone(),
            preparation,
            baseline_run_ref: None,
            comparison_key: comparison_key.clone(),
        },
        status: BenchmarkResultStatus::Complete,
        memory: MemoryMeasurement {
            status: MemoryMeasurementStatus::NotMeasured,
            peak_rss_bytes: None,
            method: None,
            scope: Some("query_series_benchmark".to_string()),
            reason: Some(
                "Peak RSS measurement is not yet instrumented for query benchmark classes."
                    .to_string(),
            ),
        },
        comparison: BenchmarkComparison {
            eligible: true,
            baseline_run_ref: None,
            comparison_key,
            reason: None,
        },
        correctness: None,
        index_timing: None,
        query_latency: Some(QueryLatencyMetrics {
            sample_count_requested: sample_count_requested * benchmark_set.cases.len() as u32,
            sample_count_completed,
            p50_ms,
            p95_ms,
            query_set_label,
        }),
        graph_hydration: None,
        bridge_codec: None,
        degradation_notes: if sample_count_completed == 0 {
            vec!["No completed query latency samples were captured.".to_string()]
        } else {
            Vec::new()
        },
    };

    let summary = BenchmarkSummary {
        local_evidence_statement:
            "Benchmark results are local evidence for this corpus and this environment only."
                .to_string(),
        corpus_summary: format!(
            "{}@{} ({:?})",
            corpus.label, corpus.revision_or_snapshot, corpus.kind
        ),
        environment_summary: format!(
            "{}-{} build_profile={}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            profile_name()
        ),
        degraded: matches!(result.status, BenchmarkResultStatus::Degraded),
        result_count: 1,
    };

    Ok(BenchmarkSuiteArtifact {
        schema_version: BENCHMARK_SCHEMA_VERSION,
        suite_id,
        generated_at_unix_ms: now_unix_ms(),
        summary,
        results: vec![result],
    })
}

fn run_hydrate_benchmark(
    workspace: &Path,
    db: &Database,
    index_report: &IndexReport,
) -> Result<BenchmarkSuiteArtifact> {
    let workspace_id: WorkspaceId = index_report.workspace_id;
    let run_id = format!("hydrate-benchmark-{}", now_unix_ms());
    let suite_id = format!("benchmark-suite-{run_id}");
    let started = now_unix_ms();

    let mut timings = Vec::with_capacity(HYDRATE_SAMPLE_COUNT as usize);
    let mut latest_stats = None;
    for _ in 0..HYDRATE_SAMPLE_COUNT {
        let sample_start = Instant::now();
        let projection = HydratedGraphProjection::hydrate(db, workspace_id)?;
        timings.push(sample_start.elapsed().as_secs_f64() * 1000.0);
        latest_stats = Some(projection.stats());
    }

    let finished = now_unix_ms();
    let sample_count_completed = timings.len() as u32;
    let stats = latest_stats.context("hydrate benchmark captured no graph hydration samples")?;

    let corpus = BenchmarkCorpusRef {
        kind: BenchmarkCorpusKind::DhRepo,
        label: workspace
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_string(),
        revision_or_snapshot: "local-working-tree".to_string(),
        root_path: workspace.to_string_lossy().to_string(),
        query_set_label: None,
        mutation_set_label: None,
        notes: Some(
            "Hydrate benchmark measures Rust in-memory graph projection construction only; it does not measure index extraction, link pass, bridge startup, or query latency."
                .to_string(),
        ),
    };

    let preparation = BenchmarkPreparationState {
        state_label: "hydrate_graph_current_index_state".to_string(),
        cleared_reusable_state: Some(false),
        preserved_reusable_state: Some(true),
        baseline_run_ref: Some(index_report.run_id.clone()),
        mutation_set_label: None,
        mutation_paths: Vec::new(),
        query_set_label: None,
        notes: vec![
            format!(
                "Hydration samples are repeated {} times against the index state produced by baseline_run_ref={}; repeated samples expose p50/p95/max instead of a single opaque hydrate value.",
                HYDRATE_SAMPLE_COUNT, index_report.run_id
            ),
            "Index report graph_hydration_ms remains exposed in index_timing for index classes; this hydrate class isolates projection hydration distribution.".to_string(),
        ],
    };

    let comparison_key = Some(comparison_key_for(
        BenchmarkClass::HydrateGraph,
        &corpus,
        profile_name(),
        &preparation,
    ));

    let graph_hydration = GraphHydrationBenchmarkMetrics {
        sample_count_requested: HYDRATE_SAMPLE_COUNT,
        sample_count_completed,
        p50_ms: percentile(&timings, 50.0),
        p95_ms: percentile(&timings, 95.0),
        max_ms: timings.iter().copied().fold(0.0, f64::max),
        workspace_id: stats.workspace_id,
        node_count: stats.node_count as u64,
        persisted_edge_count: stats.persisted_edge_count as u64,
        synthetic_edge_count: stats.synthetic_edge_count as u64,
        freshness: stats.freshness.as_str().to_string(),
        freshness_reason: stats.freshness_reason,
    };

    let mut degradation_notes = Vec::new();
    if !stats.freshness.is_current() {
        degradation_notes.push(format!(
            "Hydrated graph projection freshness is {}; latency remains measurable but this is not current hot-path evidence.",
            stats.freshness.as_str()
        ));
    }
    if index_report.not_current_files > 0 {
        degradation_notes.push(format!(
            "Baseline index report had not_current_files={}; hydrate distribution is measurable but the index state is degraded.",
            index_report.not_current_files
        ));
    }
    if sample_count_completed < HYDRATE_SAMPLE_COUNT {
        degradation_notes.push(format!(
            "Only {sample_count_completed} of {HYDRATE_SAMPLE_COUNT} requested hydration samples completed."
        ));
    }

    let result = BenchmarkResult {
        metadata: BenchmarkRunMetadata {
            run_id,
            benchmark_class: BenchmarkClass::HydrateGraph,
            suite_id: suite_id.clone(),
            started_at_unix_ms: started,
            finished_at_unix_ms: finished,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            build_profile: profile_name(),
            host_os: std::env::consts::OS.to_string(),
            host_arch: std::env::consts::ARCH.to_string(),
            cpu_count: std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1),
            corpus: corpus.clone(),
            preparation,
            baseline_run_ref: Some(index_report.run_id.clone()),
            comparison_key: comparison_key.clone(),
        },
        status: if degradation_notes.is_empty() {
            BenchmarkResultStatus::Complete
        } else {
            BenchmarkResultStatus::Degraded
        },
        memory: MemoryMeasurement {
            status: MemoryMeasurementStatus::NotMeasured,
            peak_rss_bytes: None,
            method: None,
            scope: Some("graph_hydration_benchmark".to_string()),
            reason: Some(
                "Peak RSS measurement is not yet instrumented for graph hydration benchmark classes."
                    .to_string(),
            ),
        },
        comparison: BenchmarkComparison {
            eligible: true,
            baseline_run_ref: Some(index_report.run_id.clone()),
            comparison_key,
            reason: None,
        },
        correctness: None,
        index_timing: Some(IndexBenchmarkMetrics {
            elapsed_ms: index_report.duration_ms as f64,
            link_ms: index_report.link_ms as f64,
            graph_hydration_ms: index_report.graph_hydration_ms as f64,
            scanned_files: index_report.scanned_files,
            changed_files: index_report.changed_files,
            reindexed_files: index_report.reindexed_files,
            deleted_files: index_report.deleted_files,
            refreshed_current_files: index_report.refreshed_current_files,
            retained_current_files: index_report.retained_current_files,
            degraded_partial_files: index_report.degraded_partial_files,
            not_current_files: index_report.not_current_files,
        }),
        query_latency: None,
        graph_hydration: Some(graph_hydration),
        bridge_codec: None,
        degradation_notes,
    };

    let summary = BenchmarkSummary {
        local_evidence_statement:
            "Hydrate benchmark results are local evidence for this corpus and this environment only."
                .to_string(),
        corpus_summary: format!(
            "{}@{} ({:?})",
            corpus.label, corpus.revision_or_snapshot, corpus.kind
        ),
        environment_summary: format!(
            "{}-{} build_profile={}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            profile_name()
        ),
        degraded: matches!(result.status, BenchmarkResultStatus::Degraded),
        result_count: 1,
    };

    Ok(BenchmarkSuiteArtifact {
        schema_version: BENCHMARK_SCHEMA_VERSION,
        suite_id,
        generated_at_unix_ms: now_unix_ms(),
        summary,
        results: vec![result],
    })
}

fn parity_report_to_artifact(
    report: &dh_indexer::parity::ParityReport,
    fixture_root: &Path,
) -> BenchmarkSuiteArtifact {
    let started = now_unix_ms() - report.cold_index_time_ms as i64;
    let finished = now_unix_ms();
    let run_id = format!("parity-{}", finished);
    let suite_id = format!("benchmark-suite-{run_id}");

    let corpus = BenchmarkCorpusRef {
        kind: BenchmarkCorpusKind::CuratedFixture,
        label: fixture_root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("parity-fixtures")
            .to_string(),
        revision_or_snapshot: "local-fixture-set".to_string(),
        root_path: fixture_root.to_string_lossy().to_string(),
        query_set_label: None,
        mutation_set_label: None,
        notes: Some(
            "Curated fixture corpus. This result must not be treated as universal real-repo proof."
                .to_string(),
        ),
    };

    let (status, mut degradation_notes) = parity_status_and_notes(report.cases.as_slice());
    if report.failed_cases > 0 {
        degradation_notes.push(format!(
            "{} fixture cases did not match baseline parity expectations.",
            report.failed_cases
        ));
    }

    let preparation = BenchmarkPreparationState {
        state_label: "parity_fixture_run".to_string(),
        cleared_reusable_state: None,
        preserved_reusable_state: None,
        baseline_run_ref: Some("curated-fixture-baseline-json".to_string()),
        mutation_set_label: None,
        mutation_paths: Vec::new(),
        query_set_label: None,
        notes: vec![
            "Correctness parity metrics are reported separately from index timing metrics."
                .to_string(),
            "Cold and incremental timing are local fixture-run observations only.".to_string(),
        ],
    };

    let comparison_key = Some(comparison_key_for(
        BenchmarkClass::ParityBenchmark,
        &corpus,
        profile_name(),
        &preparation,
    ));

    let result = BenchmarkResult {
        metadata: BenchmarkRunMetadata {
            run_id,
            benchmark_class: BenchmarkClass::ParityBenchmark,
            suite_id: suite_id.clone(),
            started_at_unix_ms: started,
            finished_at_unix_ms: finished,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            build_profile: profile_name(),
            host_os: std::env::consts::OS.to_string(),
            host_arch: std::env::consts::ARCH.to_string(),
            cpu_count: std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1),
            corpus: corpus.clone(),
            preparation,
            baseline_run_ref: Some("curated-fixture-baseline-json".to_string()),
            comparison_key: comparison_key.clone(),
        },
        status,
        memory: MemoryMeasurement {
            status: MemoryMeasurementStatus::NotMeasured,
            peak_rss_bytes: None,
            method: None,
            scope: Some("parity_harness_run".to_string()),
            reason: Some(
                "Peak RSS measurement is not yet instrumented for parity benchmark runs."
                    .to_string(),
            ),
        },
        comparison: BenchmarkComparison {
            eligible: true,
            baseline_run_ref: Some("curated-fixture-baseline-json".to_string()),
            comparison_key,
            reason: None,
        },
        correctness: Some(ParityBenchmarkMetrics {
            total_cases: report.total_cases,
            passed_cases: report.passed_cases,
            failed_cases: report.failed_cases,
            symbol_parity_pct: report.symbol_parity_pct,
            import_parity_pct: report.import_parity_pct,
            call_edge_parity_pct: report.call_edge_parity_pct,
            reference_parity_pct: report.reference_parity_pct,
            chunk_parity_pct: report.chunk_parity_pct,
        }),
        index_timing: Some(IndexBenchmarkMetrics {
            elapsed_ms: report.cold_index_time_ms as f64,
            link_ms: 0.0,
            graph_hydration_ms: 0.0,
            scanned_files: report.total_cases as u64,
            changed_files: report.total_cases as u64,
            reindexed_files: report.total_cases as u64,
            deleted_files: 0,
            refreshed_current_files: 0,
            retained_current_files: 0,
            degraded_partial_files: 0,
            not_current_files: 0,
        }),
        query_latency: None,
        graph_hydration: None,
        bridge_codec: None,
        degradation_notes,
    };

    let summary = BenchmarkSummary {
        local_evidence_statement:
            "Benchmark results are local evidence for this corpus and this environment only."
                .to_string(),
        corpus_summary: format!(
            "{}@{} ({:?})",
            corpus.label, corpus.revision_or_snapshot, corpus.kind
        ),
        environment_summary: format!(
            "{}-{} build_profile={}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            profile_name()
        ),
        degraded: matches!(result.status, BenchmarkResultStatus::Degraded),
        result_count: 1,
    };

    BenchmarkSuiteArtifact {
        schema_version: BENCHMARK_SCHEMA_VERSION,
        suite_id,
        generated_at_unix_ms: now_unix_ms(),
        summary,
        results: vec![result],
    }
}

fn run_bridge_codec_benchmark(workspace: &Path) -> BenchmarkSuiteArtifact {
    let started = now_unix_ms();
    let suite_id = format!("benchmark-suite-bridge-codec-{started}");
    let corpus = BenchmarkCorpusRef {
        kind: BenchmarkCorpusKind::CuratedFixture,
        label: "bridge_codec_large_payload_fixture".to_string(),
        revision_or_snapshot: "local-large-payload-v1".to_string(),
        root_path: workspace.to_string_lossy().to_string(),
        query_set_label: Some("embedding_1536_and_ast_256".to_string()),
        mutation_set_label: None,
        notes: Some(
            "Synthetic bridge payload fixture for JSON vs MessagePack serialization/deserialization overhead."
                .to_string(),
        ),
    };
    let preparation = BenchmarkPreparationState {
        state_label: "bridge_codec_synthetic_payload".to_string(),
        cleared_reusable_state: Some(false),
        preserved_reusable_state: Some(false),
        baseline_run_ref: Some("json-rpc-v1".to_string()),
        mutation_set_label: None,
        mutation_paths: Vec::new(),
        query_set_label: Some("embedding_1536_and_ast_256".to_string()),
        notes: vec![
            "Measures local encode/decode overhead only; it does not include child-process startup, DB query, or LLM latency."
                .to_string(),
            "Frame boundary remains Content-Length for both codecs; payload body differs between JSON and MessagePack."
                .to_string(),
        ],
    };
    let comparison_key = Some(comparison_key_for(
        BenchmarkClass::BridgeCodec,
        &corpus,
        profile_name(),
        &preparation,
    ));

    let payload = bridge_codec_payload();
    let sample_count_requested = 40_u32;

    let json_encode = time_json_encode(&payload, sample_count_requested);
    let json_decode = json_encode.as_ref().ok().map(|samples| time_json_decode(samples));
    let msgpack_encode = time_msgpack_encode(&payload, sample_count_requested);
    let msgpack_decode = msgpack_encode
        .as_ref()
        .ok()
        .map(|samples| time_msgpack_decode(samples));
    let finished = now_unix_ms();

    let mut degradation_notes = Vec::new();
    let mut status = BenchmarkResultStatus::Complete;

    let json_encode = match json_encode {
        Ok(value) => value,
        Err(err) => {
            status = BenchmarkResultStatus::Failed;
            degradation_notes.push(format!("JSON encode benchmark failed: {err}"));
            TimedPayloadSamples::empty()
        }
    };
    let json_decode_ms = match json_decode {
        Some(Ok(value)) => value,
        Some(Err(err)) => {
            status = BenchmarkResultStatus::Failed;
            degradation_notes.push(format!("JSON decode benchmark failed: {err}"));
            0.0
        }
        None => 0.0,
    };
    let msgpack_encode = match msgpack_encode {
        Ok(value) => value,
        Err(err) => {
            status = BenchmarkResultStatus::Failed;
            degradation_notes.push(format!("MessagePack encode benchmark failed: {err}"));
            TimedPayloadSamples::empty()
        }
    };
    let msgpack_decode_ms = match msgpack_decode {
        Some(Ok(value)) => value,
        Some(Err(err)) => {
            status = BenchmarkResultStatus::Failed;
            degradation_notes.push(format!("MessagePack decode benchmark failed: {err}"));
            0.0
        }
        None => 0.0,
    };

    let encode_speedup = ratio(json_encode.elapsed_ms, msgpack_encode.elapsed_ms);
    let decode_speedup = ratio(json_decode_ms, msgpack_decode_ms);
    let improvement_classification = classify_bridge_codec_improvement(encode_speedup, decode_speedup);
    let target_5_10x_status = classify_bridge_codec_target_status(encode_speedup, decode_speedup);
    if improvement_classification == "below_material" && status == BenchmarkResultStatus::Complete {
        status = BenchmarkResultStatus::Degraded;
        degradation_notes.push(
            "Bridge codec benchmark did not meet material improvement threshold for both encode and decode."
                .to_string(),
        );
    }

    let bridge_codec = BridgeCodecBenchmarkMetrics {
        sample_count_requested,
        sample_count_completed: if status == BenchmarkResultStatus::Failed {
            0
        } else {
            sample_count_requested
        },
        json_bytes: json_encode.bytes,
        msgpack_bytes: msgpack_encode.bytes,
        json_encode_ms: json_encode.elapsed_ms,
        json_decode_ms,
        msgpack_encode_ms: msgpack_encode.elapsed_ms,
        msgpack_decode_ms,
        encode_speedup,
        decode_speedup,
        payload_label: "embedding_1536_and_ast_256".to_string(),
        selected_codec: "msgpack-rpc-v1".to_string(),
        improvement_classification: improvement_classification.to_string(),
        target_5_10x_status: target_5_10x_status.to_string(),
    };
    let result = BenchmarkResult {
        metadata: BenchmarkRunMetadata {
            run_id: format!("bridge-codec-{started}"),
            benchmark_class: BenchmarkClass::BridgeCodec,
            suite_id: suite_id.clone(),
            started_at_unix_ms: started,
            finished_at_unix_ms: finished,
            engine_version: env!("CARGO_PKG_VERSION").to_string(),
            build_profile: profile_name(),
            host_os: std::env::consts::OS.to_string(),
            host_arch: std::env::consts::ARCH.to_string(),
            cpu_count: std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1),
            corpus: corpus.clone(),
            preparation,
            baseline_run_ref: Some("json-rpc-v1".to_string()),
            comparison_key: comparison_key.clone(),
        },
        status,
        memory: MemoryMeasurement {
            status: MemoryMeasurementStatus::NotMeasured,
            peak_rss_bytes: None,
            method: None,
            scope: Some("bridge_codec_encode_decode".to_string()),
            reason: Some("Peak RSS measurement is not instrumented for bridge codec benchmark.".to_string()),
        },
        comparison: BenchmarkComparison {
            eligible: true,
            baseline_run_ref: Some("json-rpc-v1".to_string()),
            comparison_key,
            reason: Some("Compares MessagePack encode/decode against JSON encode/decode for the same synthetic payload.".to_string()),
        },
        correctness: None,
        index_timing: None,
        query_latency: None,
        graph_hydration: None,
        bridge_codec: Some(bridge_codec),
        degradation_notes,
    };

    let summary = BenchmarkSummary {
        local_evidence_statement: "Bridge codec benchmark is local encode/decode evidence only; it does not prove end-to-end workflow latency.".to_string(),
        corpus_summary: format!(
            "{}@{} ({:?})",
            corpus.label, corpus.revision_or_snapshot, corpus.kind
        ),
        environment_summary: format!(
            "{}-{} build_profile={}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            profile_name()
        ),
        degraded: matches!(result.status, BenchmarkResultStatus::Degraded),
        result_count: 1,
    };

    BenchmarkSuiteArtifact {
        schema_version: BENCHMARK_SCHEMA_VERSION,
        suite_id,
        generated_at_unix_ms: now_unix_ms(),
        summary,
        results: vec![result],
    }
}

fn bridge_codec_payload() -> serde_json::Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": 9001,
        "method": "query.buildEvidence",
        "params": {
            "query": "large bridge payload fixture",
            "semanticVector": (0..1536).map(|index| (index as f64) / 1536.0).collect::<Vec<_>>(),
            "ast": {
                "kind": "module",
                "children": (0..256).map(|index| serde_json::json!({
                    "kind": "node",
                    "index": index,
                    "text": format!("synthetic_node_{index}"),
                    "range": { "startLine": index + 1, "endLine": index + 1 }
                })).collect::<Vec<_>>()
            },
            "evidence": {
                "items": (0..128).map(|index| serde_json::json!({
                    "filePath": format!("src/generated/file_{index}.ts"),
                    "reason": "synthetic benchmark evidence",
                    "snippet": "export function synthetic() { return true; }"
                })).collect::<Vec<_>>()
            }
        }
    })
}

#[derive(Debug, Clone)]
struct TimedPayloadSamples {
    bytes: u64,
    payloads: Vec<Vec<u8>>,
    elapsed_ms: f64,
}

impl TimedPayloadSamples {
    fn empty() -> Self {
        Self {
            bytes: 0,
            payloads: Vec::new(),
            elapsed_ms: 0.0,
        }
    }
}

fn time_json_encode(payload: &serde_json::Value, sample_count: u32) -> Result<TimedPayloadSamples> {
    let started = Instant::now();
    let mut bytes = 0_u64;
    let mut payloads = Vec::with_capacity(sample_count as usize);
    for _ in 0..sample_count {
        let encoded = serde_json::to_vec(payload).context("encode bridge payload as JSON")?;
        bytes = encoded.len() as u64;
        payloads.push(encoded);
    }
    Ok(TimedPayloadSamples {
        bytes,
        payloads,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
    })
}

fn time_json_decode(samples: &TimedPayloadSamples) -> Result<f64> {
    let started = Instant::now();
    for bytes in &samples.payloads {
        let _: serde_json::Value = serde_json::from_slice(bytes).context("decode JSON bridge payload")?;
    }
    Ok(started.elapsed().as_secs_f64() * 1000.0)
}

fn time_msgpack_encode(payload: &serde_json::Value, sample_count: u32) -> Result<TimedPayloadSamples> {
    let started = Instant::now();
    let mut bytes = 0_u64;
    let mut payloads = Vec::with_capacity(sample_count as usize);
    for _ in 0..sample_count {
        let encoded = rmp_serde::to_vec_named(payload).context("encode bridge payload as MessagePack")?;
        bytes = encoded.len() as u64;
        payloads.push(encoded);
    }
    Ok(TimedPayloadSamples {
        bytes,
        payloads,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
    })
}

fn time_msgpack_decode(samples: &TimedPayloadSamples) -> Result<f64> {
    let started = Instant::now();
    for bytes in &samples.payloads {
        let _: serde_json::Value = rmp_serde::from_slice(bytes).context("decode MessagePack bridge payload")?;
    }
    Ok(started.elapsed().as_secs_f64() * 1000.0)
}

fn classify_bridge_codec_improvement(encode_speedup: f64, decode_speedup: f64) -> &'static str {
    let weakest = encode_speedup.min(decode_speedup);
    if weakest >= 5.0 {
        "material_and_5x_target_met"
    } else if weakest >= 1.25 {
        "material_improvement"
    } else {
        "below_material"
    }
}

fn classify_bridge_codec_target_status(encode_speedup: f64, decode_speedup: f64) -> &'static str {
    let weakest = encode_speedup.min(decode_speedup);
    if weakest >= 10.0 {
        "exceeds_5_10x_target"
    } else if weakest >= 5.0 {
        "meets_5x_lower_bound"
    } else if weakest >= 1.25 {
        "material_but_below_5_10x_target"
    } else {
        "below_material_and_target"
    }
}

fn ratio(baseline: f64, candidate: f64) -> f64 {
    if candidate <= f64::EPSILON {
        return 0.0;
    }
    baseline / candidate
}

#[derive(Debug, Clone)]
struct QueryBenchmarkCase {
    symbol_name: String,
}

#[derive(Debug, Clone)]
struct QueryBenchmarkSet {
    label: String,
    sample_count_requested: u32,
    cases: Vec<QueryBenchmarkCase>,
}

fn benchmark_query_set(db: &Database) -> Result<QueryBenchmarkSet> {
    let symbols = db.find_symbols_by_workspace(1)?;
    let mut seen = HashSet::new();
    let mut cases = Vec::new();

    for symbol in symbols {
        if symbol.name.trim().is_empty() {
            continue;
        }
        if !seen.insert(symbol.name.clone()) {
            continue;
        }

        cases.push(QueryBenchmarkCase {
            symbol_name: symbol.name,
        });
        if cases.len() >= 5 {
            break;
        }
    }

    Ok(QueryBenchmarkSet {
        label: "top_symbol_names".to_string(),
        sample_count_requested: 5,
        cases,
    })
}

fn percentile(values: &[f64], percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let rank = ((percentile / 100.0) * (sorted.len().saturating_sub(1) as f64)).round() as usize;
    sorted[rank.min(sorted.len().saturating_sub(1))]
}

fn parity_status_and_notes(cases: &[ParityCaseResult]) -> (BenchmarkResultStatus, Vec<String>) {
    let mut notes = Vec::new();
    let has_failures = cases.iter().any(|case| !case.passed);
    let has_extract_failures = cases.iter().any(|case| {
        case.notes
            .iter()
            .any(|note| note.contains("extract failed"))
    });
    let has_diagnostics = cases
        .iter()
        .any(|case| case.notes.iter().any(|note| note.contains("diagnostics:")));

    if has_diagnostics {
        notes.push(
            "At least one parity case emitted parser diagnostics; diagnostics are surfaced explicitly in case-level notes."
                .to_string(),
        );
    }

    let status = if has_failures || has_extract_failures {
        BenchmarkResultStatus::Degraded
    } else {
        BenchmarkResultStatus::Complete
    };

    (status, notes)
}

fn index_preparation_state(
    class: BenchmarkClass,
    prepared_state_pre_exists: bool,
    measured_run_id: &str,
    incremental_baseline_run_ref: Option<&str>,
    incremental_baseline_prep_elapsed_ms: Option<f64>,
) -> BenchmarkPreparationState {
    match class {
        BenchmarkClass::ColdFullIndex => BenchmarkPreparationState {
            state_label: "cold_index_forced_full".to_string(),
            cleared_reusable_state: Some(true),
            preserved_reusable_state: Some(false),
            baseline_run_ref: None,
            mutation_set_label: None,
            mutation_paths: Vec::new(),
            query_set_label: None,
            notes: vec![
                "Cold full-index benchmark used force_full=true to avoid assuming reusable warm state."
                    .to_string(),
                "Result remains local evidence and does not imply startup SLA or universal behavior."
                    .to_string(),
            ],
        },
        BenchmarkClass::WarmNoChangeIndex => BenchmarkPreparationState {
            state_label: "warm_no_change_reuse".to_string(),
            cleared_reusable_state: Some(false),
            preserved_reusable_state: Some(prepared_state_pre_exists),
            baseline_run_ref: if prepared_state_pre_exists {
                Some("existing-local-index-state".to_string())
            } else {
                Some(measured_run_id.to_string())
            },
            mutation_set_label: None,
            mutation_paths: Vec::new(),
            query_set_label: None,
            notes: vec![
                "Warm index semantics refer only to reusable local prepared state within this workspace."
                    .to_string(),
                "Warm benchmark does not imply daemon mode, watch mode, or background warm service behavior."
                    .to_string(),
            ],
        },
        BenchmarkClass::IncrementalReindex => BenchmarkPreparationState {
            state_label: "incremental_reindex_no_mutation".to_string(),
            cleared_reusable_state: Some(false),
            preserved_reusable_state: Some(true),
            baseline_run_ref: incremental_baseline_run_ref.map(ToString::to_string),
            mutation_set_label: Some("none".to_string()),
            mutation_paths: Vec::new(),
            query_set_label: None,
            notes: {
                let mut notes = vec![
                    "Incremental benchmark in this feature currently uses unchanged corpus rerun as bounded baseline/mutation placeholder."
                        .to_string(),
                    "Mutation set is explicitly labeled as none to avoid overclaiming incremental-change semantics."
                        .to_string(),
                ];
                if let Some(baseline_ref) = incremental_baseline_run_ref {
                    notes.push(format!(
                        "Baseline preparation run captured as baseline_run_ref={baseline_ref}."
                    ));
                }
                if let Some(prep_ms) = incremental_baseline_prep_elapsed_ms {
                    notes.push(format!(
                        "Baseline preparation timing captured separately as baseline_prep_elapsed_ms={prep_ms:.3}; measured elapsed_ms reflects rerun timing only."
                    ));
                }
                notes
            },
        },
        _ => BenchmarkPreparationState::default(),
    }
}

fn comparison_key_for(
    class: BenchmarkClass,
    corpus: &BenchmarkCorpusRef,
    build_profile: String,
    preparation: &BenchmarkPreparationState,
) -> String {
    format!(
        "class={:?}|corpus={}@{}|profile={}|prep={}|query_set={}|mutation_set={}",
        class,
        corpus.label,
        corpus.revision_or_snapshot,
        build_profile,
        preparation.state_label,
        preparation.query_set_label.clone().unwrap_or_default(),
        preparation.mutation_set_label.clone().unwrap_or_default()
    )
}

fn memory_line(memory: &MemoryMeasurement) -> String {
    match memory.status {
        MemoryMeasurementStatus::Measured => format!(
            "  memory: measured peak_rss_bytes={} method={} scope={}",
            memory.peak_rss_bytes.unwrap_or(0),
            memory
                .method
                .clone()
                .unwrap_or_else(|| "<unknown>".to_string()),
            memory
                .scope
                .clone()
                .unwrap_or_else(|| "<unknown>".to_string())
        ),
        MemoryMeasurementStatus::NotMeasured => format!(
            "  memory: not_measured reason={}",
            memory
                .reason
                .clone()
                .unwrap_or_else(|| "not provided".to_string())
        ),
        MemoryMeasurementStatus::MeasurementFailed => format!(
            "  memory: measurement_failed reason={}",
            memory
                .reason
                .clone()
                .unwrap_or_else(|| "not provided".to_string())
        ),
    }
}

fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn profile_name() -> String {
    if cfg!(debug_assertions) {
        "debug".to_string()
    } else {
        "release".to_string()
    }
}

fn benchmark_class_label(class: BenchmarkClass) -> &'static str {
    match class {
        BenchmarkClass::ColdFullIndex => "cold_full_index",
        BenchmarkClass::WarmNoChangeIndex => "warm_no_change_index",
        BenchmarkClass::IncrementalReindex => "incremental_reindex",
        BenchmarkClass::ColdQuery => "cold_query",
        BenchmarkClass::WarmQuery => "warm_query",
        BenchmarkClass::HydrateGraph => "hydrate_graph",
        BenchmarkClass::ParityBenchmark => "parity_benchmark",
        BenchmarkClass::BridgeCodec => "bridge_codec",
    }
}

fn benchmark_status_label(status: BenchmarkResultStatus) -> &'static str {
    match status {
        BenchmarkResultStatus::Complete => "complete",
        BenchmarkResultStatus::Degraded => "degraded",
        BenchmarkResultStatus::Failed => "failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dh_types::{BenchmarkCorpusKind, BenchmarkResultStatus};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parity_benchmark_artifact_separates_correctness_and_timing() {
        let fixture_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dh-indexer/tests/fixtures/parity");

        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::ParityBenchmark,
            workspace: fixture_root,
        })
        .expect("parity benchmark should run");

        assert_eq!(response.artifact.schema_version, BENCHMARK_SCHEMA_VERSION);
        assert_eq!(response.artifact.results.len(), 1);

        let result = &response.artifact.results[0];
        assert_eq!(
            result.metadata.benchmark_class,
            BenchmarkClass::ParityBenchmark
        );
        assert_eq!(
            result.metadata.corpus.kind,
            BenchmarkCorpusKind::CuratedFixture
        );
        assert!(result.correctness.is_some());
        assert!(result.index_timing.is_some());
        assert!(result.query_latency.is_none());
        assert!(result.graph_hydration.is_none());
        assert_eq!(result.memory.status, MemoryMeasurementStatus::NotMeasured);
        assert!(result
            .memory
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("not yet instrumented")));
    }

    #[test]
    fn cold_full_index_benchmark_records_class_and_preparation() {
        let temp = tempdir().expect("temporary benchmark workspace should be created");
        let workspace = temp.path();
        fs::create_dir_all(workspace.join("src")).expect("src directory should be created");
        fs::write(
            workspace.join("src/main.ts"),
            "export function run(): number { return 1; }\n",
        )
        .expect("fixture file should be written");

        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::ColdFullIndex,
            workspace: workspace.to_path_buf(),
        })
        .expect("cold full index benchmark should run");

        let result = &response.artifact.results[0];
        assert_eq!(
            result.metadata.benchmark_class,
            BenchmarkClass::ColdFullIndex
        );
        assert_eq!(result.metadata.corpus.kind, BenchmarkCorpusKind::DhRepo);
        assert!(result.index_timing.is_some());
        let index_timing = result
            .index_timing
            .as_ref()
            .expect("cold index benchmark should include index timing metrics");
        assert!(
            index_timing.graph_hydration_ms >= 0.0,
            "index timing should expose graph hydration milliseconds"
        );
        assert!(
            index_timing.link_ms >= 0.0,
            "index timing should expose link milliseconds"
        );
        assert!(result.correctness.is_none());
        assert_eq!(
            result.metadata.preparation.cleared_reusable_state,
            Some(true)
        );
        assert_eq!(
            result.metadata.preparation.preserved_reusable_state,
            Some(false)
        );
    }

    #[test]
    fn hydrate_graph_benchmark_reports_hydration_distribution() {
        let temp = tempdir().expect("temporary workspace should be created");
        let workspace = temp.path();
        fs::create_dir_all(workspace.join("src")).expect("src directory should be created");
        fs::write(
            workspace.join("src/main.ts"),
            r#"export function helper(v: number): number {
  return v + 1;
}

export function run(): number {
  return helper(1);
}
"#,
        )
        .expect("fixture file should be written");

        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::HydrateGraph,
            workspace: workspace.to_path_buf(),
        })
        .expect("hydrate graph benchmark should run");

        let result = &response.artifact.results[0];
        assert_eq!(
            result.metadata.benchmark_class,
            BenchmarkClass::HydrateGraph
        );
        let hydration = result
            .graph_hydration
            .as_ref()
            .expect("hydrate graph benchmark should include hydration metrics");
        assert_eq!(hydration.sample_count_requested, HYDRATE_SAMPLE_COUNT);
        assert_eq!(hydration.sample_count_completed, HYDRATE_SAMPLE_COUNT);
        assert!(hydration.node_count > 0);
        assert!(hydration.p95_ms >= hydration.p50_ms);
        assert!(result.index_timing.is_some());
        assert!(result.query_latency.is_none());
        assert!(result.correctness.is_none());

        let lines = benchmark_summary_lines(&response.artifact);
        assert!(lines
            .iter()
            .any(|line| line.contains("class=hydrate_graph")));
        assert!(lines.iter().any(|line| line.contains("graph_hydration_ms")));
    }

    #[test]
    fn bridge_codec_benchmark_classifies_material_improvement_without_hidden_codec_failures() {
        let temp = tempdir().expect("temporary benchmark workspace should be created");
        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::BridgeCodec,
            workspace: temp.path().to_path_buf(),
        })
        .expect("bridge codec benchmark should run");

        let result = &response.artifact.results[0];
        assert_eq!(result.metadata.benchmark_class, BenchmarkClass::BridgeCodec);
        let bridge = result
            .bridge_codec
            .as_ref()
            .expect("bridge codec benchmark should include codec metrics");
        assert_eq!(bridge.selected_codec, "msgpack-rpc-v1");
        assert!(bridge.json_bytes > 0, "JSON bytes must not be hidden by defaulting failed serde output");
        assert!(bridge.msgpack_bytes > 0, "MessagePack bytes must not be hidden by defaulting failed serde output");
        assert!(matches!(
            bridge.improvement_classification.as_str(),
            "below_material" | "material_improvement" | "material_and_5x_target_met"
        ));
        assert!(matches!(
            bridge.target_5_10x_status.as_str(),
            "below_material_and_target"
                | "material_but_below_5_10x_target"
                | "meets_5x_lower_bound"
                | "exceeds_5_10x_target"
        ));

        let lines = benchmark_summary_lines(&response.artifact);
        assert!(lines.iter().any(|line| line.contains("improvement_class=")));
        assert!(lines.iter().any(|line| line.contains("target_5_10x_status=")));
    }

    #[test]
    fn incremental_reindex_uses_distinct_baseline_reference_and_separate_prep_timing_note() {
        let temp = tempdir().expect("temporary benchmark workspace should be created");
        let workspace = temp.path();
        fs::create_dir_all(workspace.join("src")).expect("src directory should be created");
        fs::write(
            workspace.join("src/main.ts"),
            "export function run(): number { return 1; }\n",
        )
        .expect("fixture file should be written");

        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::IncrementalReindex,
            workspace: workspace.to_path_buf(),
        })
        .expect("incremental reindex benchmark should run");

        let result = &response.artifact.results[0];
        let baseline_ref = result
            .metadata
            .baseline_run_ref
            .as_deref()
            .expect("incremental benchmark should expose baseline_run_ref");

        assert_ne!(
            baseline_ref, result.metadata.run_id,
            "baseline_run_ref must point to baseline prep run, not measured rerun run_id"
        );
        assert_eq!(
            result.comparison.baseline_run_ref.as_deref(),
            result.metadata.baseline_run_ref.as_deref(),
            "comparison baseline link must match metadata baseline link"
        );
        assert_eq!(
            result.metadata.preparation.baseline_run_ref.as_deref(),
            result.metadata.baseline_run_ref.as_deref(),
            "preparation baseline link must match metadata baseline link"
        );
        assert!(result.metadata.preparation.notes.iter().any(|note| {
            note.contains("baseline_prep_elapsed_ms=")
                && note.contains("elapsed_ms reflects rerun timing only")
        }));
    }

    #[test]
    fn warm_no_change_with_mutations_is_degraded() {
        let temp = tempdir().expect("temporary benchmark workspace should be created");
        let workspace = temp.path();
        fs::create_dir_all(workspace.join("src")).expect("src directory should be created");
        let source_path = workspace.join("src/main.ts");
        fs::write(
            &source_path,
            "export function run(): number { return 1; }\n",
        )
        .expect("fixture file should be written");

        let cold_response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::ColdFullIndex,
            workspace: workspace.to_path_buf(),
        })
        .expect("cold full index benchmark should run");
        assert_eq!(
            cold_response.artifact.results[0].status,
            BenchmarkResultStatus::Complete
        );

        fs::write(
            &source_path,
            "export function run(): number { return 2; }\n",
        )
        .expect("fixture file should be updated to introduce mutation");

        let warm_response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::WarmNoChangeIndex,
            workspace: workspace.to_path_buf(),
        })
        .expect("warm no-change benchmark should run");

        let warm_result = &warm_response.artifact.results[0];
        let index_metrics = warm_result
            .index_timing
            .as_ref()
            .expect("warm benchmark should include index timing metrics");

        assert!(
            index_metrics.changed_files > 0,
            "test setup should introduce changed files"
        );
        assert_eq!(
            warm_result.status,
            BenchmarkResultStatus::Degraded,
            "warm_no_change_index must not be complete when changed_files > 0"
        );
        assert!(warm_result.degradation_notes.iter().any(|note| {
            note.contains("warm_no_change_index detected changed_files=")
                && note.contains("cannot be marked complete")
        }));
        assert!(!warm_result.comparison.eligible);
        assert!(warm_result
            .comparison
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("observes changed files")));
    }

    #[test]
    fn summary_lines_are_local_evidence_only_and_include_memory_status() {
        let fixture_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dh-indexer/tests/fixtures/parity");

        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::ParityBenchmark,
            workspace: fixture_root,
        })
        .expect("parity benchmark should run");

        let lines = benchmark_summary_lines(&response.artifact);
        assert!(lines.iter().any(|line| {
            line.contains(
                "Benchmark results are local evidence for this corpus and this environment only",
            )
        }));
        assert!(lines
            .iter()
            .any(|line| line.contains("memory: not_measured")));
        assert!(
            lines
                .iter()
                .any(|line| line.contains("class=parity_benchmark")),
            "summary should use canonical snake_case benchmark class labels"
        );
        assert!(!lines.iter().any(|line| {
            let lowered = line.to_ascii_lowercase();
            lowered.contains("guarantee")
                || lowered.contains("always")
                || lowered.contains("all repos")
        }));
    }

    #[test]
    fn degraded_parity_case_produces_degraded_status() {
        let fixture_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dh-indexer/tests/fixtures/parity");
        let baseline_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dh-indexer/tests/fixtures/parity-baselines");

        let temp = tempdir().expect("temporary fixture directory should be created");
        let temp_fixture_root = temp.path().join("parity");
        let temp_baseline_root = temp.path().join("parity-baselines");
        copy_fixture_files(&fixture_root, &temp_fixture_root);
        copy_fixture_files(&baseline_root, &temp_baseline_root);

        let imports_baseline_path = temp_baseline_root.join("imports-and-exports.ts.json");
        let baseline_json = fs::read_to_string(&imports_baseline_path)
            .expect("imports baseline fixture JSON should be readable");
        fs::write(
            &imports_baseline_path,
            baseline_json.replace("\"imports\": 3,", "\"imports\": 2,"),
        )
        .expect("imports baseline fixture JSON should be writable");

        let harness = ParityHarness::with_baseline_root(temp_fixture_root, temp_baseline_root);
        let report = harness.run().expect("parity harness should run");
        let artifact = parity_report_to_artifact(&report, temp.path());

        assert_eq!(artifact.results.len(), 1);
        assert_eq!(artifact.results[0].status, BenchmarkResultStatus::Degraded);
        assert!(!artifact.results[0].degradation_notes.is_empty());
    }

    #[test]
    fn diagnostics_only_parity_case_stays_complete() {
        let fixture_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dh-indexer/tests/fixtures/parity");

        let response = run_benchmark(BenchmarkRunRequest {
            class: BenchmarkClass::ParityBenchmark,
            workspace: fixture_root,
        })
        .expect("parity benchmark should run");

        let result = &response.artifact.results[0];
        assert_eq!(
            result.status,
            BenchmarkResultStatus::Complete,
            "diagnostic notes without mismatched parity should not force degraded status"
        );
        assert!(
            result
                .degradation_notes
                .iter()
                .any(|note| note.contains("parser diagnostics")),
            "diagnostics should still be surfaced explicitly"
        );
    }

    #[test]
    fn profile_name_is_debug_or_release() {
        let profile = profile_name();
        assert!(profile == "debug" || profile == "release");
    }

    fn copy_fixture_files(src: &Path, dst: &Path) {
        fs::create_dir_all(dst).expect("fixture destination directory should be created");
        for entry in fs::read_dir(src).expect("fixture directory should be readable") {
            let entry = entry.expect("fixture directory entry should be readable");
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            fs::copy(&path, dst.join(entry.file_name()))
                .expect("fixture file should copy into temporary directory");
        }
    }
}
