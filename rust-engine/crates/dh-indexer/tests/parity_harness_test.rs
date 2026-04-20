use dh_indexer::parity::{ParityHarness, ParityReport};
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use tempfile::tempdir;

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/parity")
}

fn baseline_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/parity-baselines")
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

#[test]
fn loads_parity_baselines() {
    let harness = ParityHarness::new(fixture_root());
    let baselines = harness
        .load_baselines()
        .expect("parity baselines should load");

    assert_eq!(baselines.len(), 5);
    assert!(baselines
        .iter()
        .any(|baseline| baseline.file == "simple-module.ts"));
    assert!(baselines
        .iter()
        .any(|baseline| baseline.file == "syntax-error.ts"));
}

#[test]
fn fixture_corpus_parity_report_is_passing() {
    let harness = ParityHarness::new(fixture_root());
    let report = harness.run().expect("parity harness should run");

    assert_eq!(report.total_cases, 5);
    assert_eq!(
        report.failed_cases, 0,
        "all curated fixtures should pass baseline parity"
    );
    assert_eq!(report.passed_cases, report.total_cases);
}

#[test]
fn syntax_error_fixture_reports_errors_honestly() {
    let harness = ParityHarness::new(fixture_root());
    let report = harness.run().expect("parity harness should run");

    let syntax_case = report
        .cases
        .iter()
        .find(|case| case.file == "syntax-error.ts")
        .expect("syntax-error fixture case should exist");

    assert_eq!(syntax_case.expected_parse_status, "ParsedWithErrors");
    assert_eq!(syntax_case.actual_parse_status, "ParsedWithErrors");
    assert!(syntax_case
        .notes
        .iter()
        .any(|note| note.contains("diagnostics:")));
}

#[test]
fn incremental_timing_is_recorded() {
    let harness = ParityHarness::new(fixture_root());
    let report: ParityReport = harness.run().expect("parity harness should run");

    assert!(report.incremental_index_time_ms > 0);
    assert!(report.cold_index_time_ms > 0);
}

#[test]
fn overcount_mismatch_reduces_import_parity_below_100() {
    let temp = tempdir().expect("temporary fixture directory should be created");
    let temp_fixture_root = temp.path().join("parity");
    let temp_baseline_root = temp.path().join("parity-baselines");

    copy_fixture_files(&fixture_root(), &temp_fixture_root);
    copy_fixture_files(&baseline_root(), &temp_baseline_root);

    let imports_baseline_path = temp_baseline_root.join("imports-and-exports.ts.json");
    let baseline_json = fs::read_to_string(&imports_baseline_path)
        .expect("imports baseline fixture JSON should be readable");
    let updated_baseline_json = baseline_json.replace("\"imports\": 3,", "\"imports\": 2,");
    assert_ne!(
        baseline_json, updated_baseline_json,
        "test setup should create an over-count mismatch"
    );
    fs::write(imports_baseline_path, updated_baseline_json)
        .expect("imports baseline fixture JSON should be writable");

    let harness = ParityHarness::new(temp_fixture_root);
    let report = harness.run().expect("parity harness should run");

    assert_eq!(report.total_cases, 5);
    assert_eq!(report.failed_cases, 1);
    assert!(
        report.import_parity_pct < 100.0,
        "over-count mismatch must lower parity percentage"
    );
    assert_eq!(report.import_parity_pct, 75.0);

    let mismatch_case = report
        .cases
        .iter()
        .find(|case| case.file == "imports-and-exports.ts")
        .expect("imports-and-exports fixture case should exist");
    assert_eq!(mismatch_case.expected_imports, 2);
    assert_eq!(mismatch_case.actual_imports, 3);
    assert!(!mismatch_case.passed);
}
