use anyhow::{Context, Result};
use dh_parser::{
    default_language_registry, extract_file_facts, pool::ParserPool, ExtractionContext,
};
use dh_types::{LanguageId, ParseStatus};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const DEFAULT_BASELINE_DIR_NAME: &str = "parity-baselines";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaselineExpected {
    pub symbols: u32,
    pub imports: u32,
    pub call_edges: u32,
    pub references: u32,
    pub chunks: u32,
    pub parse_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParityBaseline {
    pub file: String,
    pub expected: BaselineExpected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParityCaseResult {
    pub file: String,
    pub expected_symbols: u32,
    pub actual_symbols: u32,
    pub expected_imports: u32,
    pub actual_imports: u32,
    pub expected_call_edges: u32,
    pub actual_call_edges: u32,
    pub expected_references: u32,
    pub actual_references: u32,
    pub expected_chunks: u32,
    pub actual_chunks: u32,
    pub expected_parse_status: String,
    pub actual_parse_status: String,
    pub passed: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParityReport {
    pub total_cases: u32,
    pub passed_cases: u32,
    pub failed_cases: u32,
    pub symbol_parity_pct: f32,
    pub import_parity_pct: f32,
    pub call_edge_parity_pct: f32,
    pub reference_parity_pct: f32,
    pub chunk_parity_pct: f32,
    pub cold_index_time_ms: u128,
    pub incremental_index_time_ms: u128,
    pub cases: Vec<ParityCaseResult>,
}

#[derive(Debug, Clone)]
pub struct ParityHarness {
    fixture_root: PathBuf,
    baseline_root: PathBuf,
}

impl ParityHarness {
    #[must_use]
    pub fn new(fixture_root: PathBuf) -> Self {
        let baseline_root = fixture_root
            .parent()
            .map(|parent| parent.join(DEFAULT_BASELINE_DIR_NAME))
            .unwrap_or_else(|| PathBuf::from(DEFAULT_BASELINE_DIR_NAME));

        Self {
            fixture_root,
            baseline_root,
        }
    }

    #[must_use]
    pub fn with_baseline_root(fixture_root: PathBuf, baseline_root: PathBuf) -> Self {
        Self {
            fixture_root,
            baseline_root,
        }
    }

    pub fn load_baselines(&self) -> Result<Vec<ParityBaseline>> {
        let fixture_files = list_fixture_files(&self.fixture_root)?;
        let mut baselines = Vec::with_capacity(fixture_files.len());

        for fixture_file in fixture_files {
            let file_name = fixture_file
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| {
                    anyhow::anyhow!("invalid fixture filename: {}", fixture_file.display())
                })?
                .to_string();
            let baseline_path = self.baseline_root.join(format!("{file_name}.json"));
            let baseline_json = fs::read_to_string(&baseline_path)
                .with_context(|| format!("read baseline JSON {}", baseline_path.display()))?;
            let baseline: ParityBaseline = serde_json::from_str(&baseline_json)
                .with_context(|| format!("parse baseline JSON {}", baseline_path.display()))?;
            baselines.push(baseline);
        }

        baselines.sort_by(|a, b| a.file.cmp(&b.file));
        Ok(baselines)
    }

    pub fn run(&self) -> Result<ParityReport> {
        let baselines = self.load_baselines()?;
        let registry = default_language_registry();

        let mut cold_pool = ParserPool::new();
        let cold_started = Instant::now();
        let cold_cases = self.run_cases(&baselines, &registry, &mut cold_pool)?;
        let cold_index_time_ms = cold_started.elapsed().as_millis();

        let mut incremental_pool = ParserPool::new();
        let incremental_started = Instant::now();
        let _ = self.run_cases(&baselines, &registry, &mut incremental_pool)?;
        let incremental_index_time_ms = incremental_started.elapsed().as_millis();

        let total_cases = cold_cases.len() as u32;
        let passed_cases = cold_cases.iter().filter(|case| case.passed).count() as u32;
        let failed_cases = total_cases.saturating_sub(passed_cases);

        let report = ParityReport {
            total_cases,
            passed_cases,
            failed_cases,
            symbol_parity_pct: parity_percentage(
                cold_cases
                    .iter()
                    .map(|case| (case.expected_symbols, case.actual_symbols)),
            ),
            import_parity_pct: parity_percentage(
                cold_cases
                    .iter()
                    .map(|case| (case.expected_imports, case.actual_imports)),
            ),
            call_edge_parity_pct: parity_percentage(
                cold_cases
                    .iter()
                    .map(|case| (case.expected_call_edges, case.actual_call_edges)),
            ),
            reference_parity_pct: parity_percentage(
                cold_cases
                    .iter()
                    .map(|case| (case.expected_references, case.actual_references)),
            ),
            chunk_parity_pct: parity_percentage(
                cold_cases
                    .iter()
                    .map(|case| (case.expected_chunks, case.actual_chunks)),
            ),
            cold_index_time_ms,
            incremental_index_time_ms,
            cases: cold_cases,
        };

        Ok(report)
    }

    fn run_cases(
        &self,
        baselines: &[ParityBaseline],
        registry: &dh_parser::registry::LanguageRegistry,
        parser_pool: &mut ParserPool,
    ) -> Result<Vec<ParityCaseResult>> {
        let mut cases = Vec::with_capacity(baselines.len());

        for baseline in baselines {
            let fixture_path = self.fixture_root.join(&baseline.file);
            let source = fs::read_to_string(&fixture_path)
                .with_context(|| format!("read fixture {}", fixture_path.display()))?;

            let language = detect_language_for_fixture(&fixture_path).ok_or_else(|| {
                anyhow::anyhow!("unsupported fixture extension: {}", fixture_path.display())
            })?;

            let context = ExtractionContext {
                workspace_id: 1,
                root_id: 1,
                package_id: None,
                file_id: stable_file_id(&baseline.file),
                rel_path: &baseline.file,
                source: &source,
                abs_path: Some(fixture_path.clone()),
                workspace_root: Some(self.fixture_root.clone()),
                workspace_roots: vec![self.fixture_root.clone()],
                package_roots: Vec::new(),
            };

            let extracted = extract_file_facts(registry, parser_pool, language, &context);

            let mut notes = Vec::new();
            let mut passed = true;

            let expected = &baseline.expected;

            let (
                actual_symbols,
                actual_imports,
                actual_call_edges,
                actual_references,
                actual_chunks,
                actual_parse_status,
                diagnostics,
            ) = match extracted {
                Ok(extracted) => (
                    extracted.symbols.len() as u32,
                    extracted.imports.len() as u32,
                    extracted.call_edges.len() as u32,
                    extracted.references.len() as u32,
                    extracted.chunks.len() as u32,
                    parse_status_to_string(extracted.parse_status),
                    extracted.diagnostics,
                ),
                Err(err) => {
                    notes.push(format!("extract failed: {err}"));
                    (
                        0,
                        0,
                        0,
                        0,
                        0,
                        parse_status_to_string(ParseStatus::Failed),
                        Vec::new(),
                    )
                }
            };

            if expected.symbols != actual_symbols {
                passed = false;
                notes.push(format!(
                    "symbol mismatch: expected {}, actual {}",
                    expected.symbols, actual_symbols
                ));
            }

            if expected.imports != actual_imports {
                passed = false;
                notes.push(format!(
                    "import mismatch: expected {}, actual {}",
                    expected.imports, actual_imports
                ));
            }

            if expected.call_edges != actual_call_edges {
                passed = false;
                notes.push(format!(
                    "call-edge mismatch: expected {}, actual {}",
                    expected.call_edges, actual_call_edges
                ));
            }

            if expected.references != actual_references {
                passed = false;
                notes.push(format!(
                    "reference mismatch: expected {}, actual {}",
                    expected.references, actual_references
                ));
            }

            if expected.chunks != actual_chunks {
                passed = false;
                notes.push(format!(
                    "chunk mismatch: expected {}, actual {}",
                    expected.chunks, actual_chunks
                ));
            }

            if expected.parse_status != actual_parse_status {
                passed = false;
                notes.push(format!(
                    "parse status mismatch: expected {}, actual {}",
                    expected.parse_status, actual_parse_status
                ));
            }

            if !diagnostics.is_empty() {
                notes.push(format!(
                    "diagnostics: {}",
                    diagnostics
                        .iter()
                        .map(|diag| diag.message.as_str())
                        .collect::<Vec<_>>()
                        .join(" | ")
                ));
            }

            cases.push(ParityCaseResult {
                file: baseline.file.clone(),
                expected_symbols: expected.symbols,
                actual_symbols,
                expected_imports: expected.imports,
                actual_imports,
                expected_call_edges: expected.call_edges,
                actual_call_edges,
                expected_references: expected.references,
                actual_references,
                expected_chunks: expected.chunks,
                actual_chunks,
                expected_parse_status: expected.parse_status.clone(),
                actual_parse_status,
                passed,
                notes,
            });
        }

        Ok(cases)
    }
}

pub fn write_report_json(report: &ParityReport, output_path: &Path) -> Result<()> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create report parent directory {}", parent.display()))?;
    }

    let json = serde_json::to_string_pretty(report).context("serialize parity report as JSON")?;
    fs::write(output_path, json)
        .with_context(|| format!("write parity report JSON {}", output_path.display()))?;
    Ok(())
}

pub fn parity_summary_lines(report: &ParityReport) -> Vec<String> {
    let mut lines = Vec::new();
    lines.push("Parity summary".to_string());
    lines.push(format!(
        "cases: {} total, {} passed, {} failed",
        report.total_cases, report.passed_cases, report.failed_cases
    ));
    lines.push(format!("symbol parity: {:.2}%", report.symbol_parity_pct));
    lines.push(format!("import parity: {:.2}%", report.import_parity_pct));
    lines.push(format!(
        "call-edge parity: {:.2}%",
        report.call_edge_parity_pct
    ));
    lines.push(format!(
        "reference parity: {:.2}%",
        report.reference_parity_pct
    ));
    lines.push(format!("chunk parity: {:.2}%", report.chunk_parity_pct));
    lines.push(format!(
        "cold index time (ms): {}",
        report.cold_index_time_ms
    ));
    lines.push(format!(
        "incremental index time (ms): {}",
        report.incremental_index_time_ms
    ));
    lines.push("cases: ".to_string());

    for case in &report.cases {
        lines.push(format!(
            "- {}: {}",
            case.file,
            if case.passed { "PASS" } else { "FAIL" }
        ));
        if !case.notes.is_empty() {
            for note in &case.notes {
                lines.push(format!("  - {}", note));
            }
        }
    }

    lines
}

fn list_fixture_files(root: &Path) -> Result<Vec<PathBuf>> {
    let entries =
        fs::read_dir(root).with_context(|| format!("read fixture directory {}", root.display()))?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.with_context(|| format!("read fixture entry in {}", root.display()))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if detect_language_for_fixture(&path).is_some() {
            files.push(path);
        }
    }

    files.sort();
    Ok(files)
}

fn detect_language_for_fixture(path: &Path) -> Option<LanguageId> {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("ts") => Some(LanguageId::TypeScript),
        Some("tsx") => Some(LanguageId::Tsx),
        Some("js") => Some(LanguageId::JavaScript),
        Some("jsx") => Some(LanguageId::Jsx),
        _ => None,
    }
}

fn parse_status_to_string(status: ParseStatus) -> String {
    match status {
        ParseStatus::Pending => "Pending",
        ParseStatus::Parsed => "Parsed",
        ParseStatus::ParsedWithErrors => "ParsedWithErrors",
        ParseStatus::Failed => "Failed",
        ParseStatus::Skipped => "Skipped",
    }
    .to_string()
}

fn stable_file_id(file: &str) -> i64 {
    let hash = blake3::hash(file.as_bytes());
    let mut bytes = [0_u8; 8];
    bytes.copy_from_slice(&hash.as_bytes()[..8]);
    let id = (u64::from_le_bytes(bytes) & 0x7FFF_FFFF_FFFF_FFFF) as i64;
    if id == 0 {
        1
    } else {
        id
    }
}

fn parity_percentage(values: impl Iterator<Item = (u32, u32)>) -> f32 {
    let mut compared_total = 0_u64;
    let mut mismatch_total = 0_u64;

    for (expected, actual) in values {
        compared_total = compared_total.saturating_add(expected.max(actual) as u64);
        mismatch_total = mismatch_total.saturating_add(expected.abs_diff(actual) as u64);
    }

    if compared_total == 0 {
        return 100.0;
    }

    ((compared_total.saturating_sub(mismatch_total)) as f32 / compared_total as f32) * 100.0
}
