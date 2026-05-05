use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::tempdir;

fn engine_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_dh-engine"))
}

fn run_engine(args: &[&str], workspace: &Path, output_path: &Path) -> (String, String) {
    let result = Command::new(engine_bin())
        .args(args)
        .arg("--workspace")
        .arg(workspace)
        .arg("--output")
        .arg(output_path)
        .output()
        .expect("dh-engine command should execute");

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    assert!(
        result.status.success(),
        "dh-engine command should succeed\nstdout:\n{}\nstderr:\n{}",
        stdout,
        stderr
    );

    (stdout, stderr)
}

#[test]
fn benchmark_cli_parity_outputs_structured_artifact() {
    let fixture_root =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dh-indexer/tests/fixtures/parity");
    let temp = tempdir().expect("temporary output directory should be created");
    let output_path = temp.path().join("parity-benchmark.json");

    let (stdout, _) = run_engine(
        &["benchmark", "--class", "parity-benchmark"],
        &fixture_root,
        &output_path,
    );

    assert!(stdout.contains("Benchmark summary"));
    assert!(stdout.contains("scope:"));

    let artifact: Value = serde_json::from_str(
        &fs::read_to_string(&output_path).expect("benchmark output JSON should be readable"),
    )
    .expect("benchmark output JSON should parse");

    assert_eq!(artifact["schema_version"], 1);
    assert_eq!(
        artifact["results"][0]["metadata"]["benchmark_class"],
        "parity_benchmark"
    );
    assert!(artifact["results"][0]["correctness"].is_object());
    assert!(artifact["results"][0]["index_timing"].is_object());
    assert!(artifact["results"][0]["query_latency"].is_null());
    assert!(artifact["results"][0]["graph_hydration"].is_null());
    assert_eq!(artifact["results"][0]["memory"]["status"], "not_measured");
}

#[test]
fn benchmark_cli_cold_query_reports_distribution_and_memory_status() {
    let workspace = tempdir().expect("temporary workspace should be created");
    fs::create_dir_all(workspace.path().join("src")).expect("src directory should be created");
    fs::write(
        workspace.path().join("src/main.ts"),
        r#"export function helper(v: number): number {
  return v + 1;
}

export function run(): number {
  return helper(1);
}
"#,
    )
    .expect("fixture TypeScript file should be written");

    let temp = tempdir().expect("temporary output directory should be created");
    let output_path = temp.path().join("cold-query-benchmark.json");

    let (stdout, _) = run_engine(
        &["benchmark", "--class", "cold-query"],
        workspace.path(),
        &output_path,
    );

    assert!(stdout.contains("query_latency_ms"));
    assert!(stdout.contains("memory: not_measured"));

    let artifact: Value = serde_json::from_str(
        &fs::read_to_string(&output_path).expect("benchmark output JSON should be readable"),
    )
    .expect("benchmark output JSON should parse");

    assert_eq!(
        artifact["results"][0]["metadata"]["benchmark_class"],
        "cold_query"
    );
    assert!(artifact["results"][0]["correctness"].is_null());
    assert!(artifact["results"][0]["index_timing"].is_null());
    assert!(artifact["results"][0]["query_latency"].is_object());
    assert_eq!(artifact["results"][0]["memory"]["status"], "not_measured");
    assert!(
        artifact["results"][0]["query_latency"]["sample_count_requested"]
            .as_u64()
            .unwrap_or(0)
            > 0
    );
    assert!(
        artifact["results"][0]["query_latency"]["sample_count_completed"]
            .as_u64()
            .unwrap_or(0)
            > 0
    );
}

#[test]
fn benchmark_cli_hydrate_graph_reports_hydration_distribution() {
    let workspace = tempdir().expect("temporary workspace should be created");
    fs::create_dir_all(workspace.path().join("src")).expect("src directory should be created");
    fs::write(
        workspace.path().join("src/main.ts"),
        r#"export function helper(v: number): number {
  return v + 1;
}

export function run(): number {
  return helper(1);
}
"#,
    )
    .expect("fixture TypeScript file should be written");

    let temp = tempdir().expect("temporary output directory should be created");
    let output_path = temp.path().join("hydrate-graph-benchmark.json");

    let (stdout, _) = run_engine(
        &["benchmark", "--class", "hydrate-graph"],
        workspace.path(),
        &output_path,
    );

    assert!(stdout.contains("class=hydrate_graph"));
    assert!(stdout.contains("graph_hydration_ms"));

    let artifact: Value = serde_json::from_str(
        &fs::read_to_string(&output_path).expect("benchmark output JSON should be readable"),
    )
    .expect("benchmark output JSON should parse");

    assert_eq!(
        artifact["results"][0]["metadata"]["benchmark_class"],
        "hydrate_graph"
    );
    assert!(artifact["results"][0]["graph_hydration"].is_object());
    assert_eq!(
        artifact["results"][0]["graph_hydration"]["sample_count_requested"],
        5
    );
    assert!(
        artifact["results"][0]["graph_hydration"]["sample_count_completed"]
            .as_u64()
            .unwrap_or(0)
            > 0
    );
    assert!(artifact["results"][0]["index_timing"].is_object());
    assert!(artifact["results"][0]["query_latency"].is_null());
}

#[test]
fn parity_command_uses_canonical_benchmark_artifact_shape() {
    let fixture_root =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dh-indexer/tests/fixtures/parity");
    let temp = tempdir().expect("temporary output directory should be created");
    let output_path = temp.path().join("parity-compatibility.json");

    let (stdout, _) = run_engine(&["parity"], &fixture_root, &output_path);

    assert!(stdout.contains("Benchmark summary"));
    let artifact: Value = serde_json::from_str(
        &fs::read_to_string(&output_path).expect("parity output JSON should be readable"),
    )
    .expect("parity output JSON should parse");

    assert_eq!(artifact["schema_version"], 1);
    assert_eq!(
        artifact["results"][0]["metadata"]["benchmark_class"],
        "parity_benchmark"
    );
}
