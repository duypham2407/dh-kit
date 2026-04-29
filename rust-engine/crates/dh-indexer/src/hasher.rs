use blake3::Hasher;
use indicatif::{ProgressBar, ProgressStyle};
use std::collections::HashMap;
use std::fs;
use tracing::warn;

use dh_types::FileCandidate;

pub struct HashCandidatesResult {
    pub hashes: HashMap<String, String>,
    pub hash_failures: HashMap<String, String>,
    pub warnings: Vec<String>,
}

pub fn hash_candidates(candidates: &[FileCandidate]) -> HashCandidatesResult {
    let mut hashes = HashMap::new();
    let mut hash_failures = HashMap::new();
    let mut warnings = Vec::new();

    let pb = ProgressBar::new(candidates.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) Hashing")
            .unwrap()
            .progress_chars("#>-"),
    );

    for candidate in candidates {
        match fs::read(&candidate.abs_path) {
            Ok(content) => {
                let mut hasher = Hasher::new();
                hasher.update(&content);
                let hex = hasher.finalize().to_hex().to_string();
                hashes.insert(candidate.rel_path.clone(), hex);
            }
            Err(err) => {
                let message = format!(
                    "failed to read file for hashing: {} ({err})",
                    candidate.abs_path.display()
                );
                warn!("{message}");
                hash_failures.insert(candidate.rel_path.clone(), message.clone());
                warnings.push(message);
            }
        }
        pb.inc(1);
    }

    pb.finish_and_clear();

    HashCandidatesResult {
        hashes,
        hash_failures,
        warnings,
    }
}
