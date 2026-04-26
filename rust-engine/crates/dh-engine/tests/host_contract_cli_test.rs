use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn engine_bin() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_dh-engine"))
}

#[test]
fn host_contract_cli_prints_lifecycle_and_protocol_contracts() {
    let result = Command::new(engine_bin())
        .args(["host-contract", "--json"])
        .output()
        .expect("dh-engine host-contract command should execute");

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    assert!(
        result.status.success(),
        "host-contract command should succeed\nstdout:\n{}\nstderr:\n{}",
        stdout,
        stderr
    );

    let payload: Value = serde_json::from_str(&stdout).expect("host contract JSON should parse");

    assert_eq!(
        payload["lifecycleContract"]["topology"],
        "rust_host_ts_worker"
    );
    assert_eq!(
        payload["lifecycleContract"]["supportBoundary"],
        "knowledge_commands_first_wave"
    );
    assert_eq!(payload["lifecycleContract"]["authorityOwner"], "rust");
    assert_eq!(
        payload["lifecycleContract"]["boundaries"]["daemonMode"],
        false
    );
    assert_eq!(
        payload["lifecycleContract"]["boundaries"]["networkTransport"],
        false
    );
    assert_eq!(
        payload["lifecycleContract"]["boundaries"]["windowsSupport"],
        false
    );
    assert_eq!(
        payload["workerProtocolContract"]["framing"]["transport"],
        "jsonrpc_stdio_content_length"
    );
    assert_eq!(
        payload["workerProtocolContract"]["workerToHostQueryMethods"],
        serde_json::json!([
            "query.search",
            "query.definition",
            "query.relationship",
            "query.buildEvidence"
        ])
    );
    assert_eq!(
        payload["workerProtocolContract"]["framing"]["arbitraryMethodPassthrough"],
        false
    );
    assert_eq!(
        payload["workerProtocolContract"]["buildEvidence"]["method"],
        "query.buildEvidence"
    );
    assert_eq!(
        payload["workerProtocolContract"]["buildEvidence"]["answerStates"],
        serde_json::json!(["grounded", "partial", "insufficient", "unsupported"])
    );
    assert_eq!(
        payload["workerProtocolContract"]["buildEvidence"]["canonicalPacketOwner"],
        "rust"
    );
    assert_eq!(
        payload["workerProtocolContract"]["buildEvidence"]["typescriptPacketSynthesis"],
        false
    );
    assert_eq!(
        payload["workerProtocolContract"]["buildEvidence"]["lifecycleEvidenceSeparation"],
        true
    );
    assert_eq!(
        payload["workerProtocolContract"]["buildEvidence"]["genericPassthrough"],
        false
    );
}

#[test]
fn first_wave_command_without_worker_bundle_is_rust_classified_startup_failure() {
    let result = Command::new(engine_bin())
        .args(["ask", "where is runKnowledgeCommand?", "--json"])
        .output()
        .expect("dh-engine ask command should execute");

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();
    assert!(
        !result.status.success(),
        "ask without worker bundle should fail as startup-class lifecycle failure\nstdout:\n{}\nstderr:\n{}",
        stdout,
        stderr
    );

    let payload: Value = serde_json::from_str(&stdout).expect("ask failure JSON should parse");
    assert_eq!(payload["command"], "ask");
    assert_eq!(payload["topology"], "rust_host_ts_worker");
    assert_eq!(payload["supportBoundary"], "knowledge_commands_first_wave");
    assert_eq!(
        payload["legacyPathLabel"],
        "legacy_ts_host_bridge_compatibility_only"
    );
    assert_eq!(payload["rustLifecycle"]["failurePhase"], "startup");
    assert_eq!(payload["rustLifecycle"]["finalStatus"], "startup_failed");
    assert_eq!(payload["rustLifecycle"]["finalExitCode"], 1);
    assert_eq!(
        payload["rustLifecycle"]["launchabilityIssue"],
        "bundle_missing"
    );
    assert!(payload["rustHostNotes"]
        .as_array()
        .is_some_and(|notes| notes.iter().any(|note| note
            .as_str()
            .is_some_and(|text| text.contains("No legacy TypeScript-host fallback")))));
}

#[test]
fn first_wave_command_resolves_default_worker_bundle_manifest_from_current_directory() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let worker_dir = temp_dir.path().join("ts-worker");
    fs::create_dir_all(&worker_dir).expect("worker dir");
    fs::write(worker_dir.join("worker.mjs"), "console.error('worker');").expect("worker bundle");
    fs::write(
        worker_dir.join("manifest.json"),
        r#"{"protocolVersion":"2","entryPath":"worker.mjs"}"#,
    )
    .expect("worker manifest");

    let result = Command::new(engine_bin())
        .current_dir(temp_dir.path())
        .args([
            "ask",
            "where is runKnowledgeCommand?",
            "--workspace",
            temp_dir.path().to_str().expect("workspace path"),
            "--json",
        ])
        .output()
        .expect("dh-engine ask command should execute");

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let payload: Value = serde_json::from_str(&stdout).expect("ask failure JSON should parse");
    assert_eq!(payload["rustLifecycle"]["failurePhase"], "startup");
    assert_eq!(
        payload["rustLifecycle"]["launchabilityIssue"],
        "protocol_mismatch"
    );
    assert_ne!(
        payload["rustLifecycle"]["launchabilityIssue"],
        "bundle_missing"
    );
}
