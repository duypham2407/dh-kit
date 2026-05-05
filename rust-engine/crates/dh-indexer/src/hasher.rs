use blake3::Hasher;
use dh_types::{File, FileCandidate, RootId};
use indicatif::{ProgressBar, ProgressStyle};
use std::collections::{HashMap, HashSet};
use std::fs;
use tracing::warn;

pub struct HashCandidatesResult {
    pub hashes: HashMap<String, String>,
    pub hashes_by_file_key: HashMap<FileKey, String>,
    pub hash_failures: HashMap<String, String>,
    pub hash_failures_by_file_key: HashMap<FileKey, String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct FileKey {
    pub root_id: RootId,
    pub rel_path: String,
}

impl FileKey {
    #[must_use]
    pub fn new(root_id: RootId, rel_path: impl Into<String>) -> Self {
        Self {
            root_id,
            rel_path: rel_path.into().replace('\\', "/"),
        }
    }
}

pub fn hash_candidates(candidates: &[FileCandidate]) -> HashCandidatesResult {
    hash_candidates_with_filter(candidates, |_| true)
}

pub fn hash_incremental_candidates(
    candidates: &[FileCandidate],
    existing_files: &[File],
    force_full: bool,
    touched_paths: Option<&[String]>,
    touched_file_keys: Option<&[FileKey]>,
) -> HashCandidatesResult {
    let existing_by_key = existing_files
        .iter()
        .map(|file| (FileKey::new(file.root_id, file.rel_path.clone()), file))
        .collect::<HashMap<_, _>>();
    let touched_path_set = touched_paths
        .map(|paths| {
            paths
                .iter()
                .map(|path| path.replace('\\', "/"))
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();
    let touched_key_set = touched_file_keys
        .map(|keys| keys.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default();

    hash_candidates_with_filter(candidates, |candidate| {
        let candidate_key = FileKey::new(candidate.root_id, candidate.rel_path.clone());
        if force_full
            || touched_key_set.contains(&candidate_key)
            || (touched_key_set.is_empty() && touched_path_set.contains(&candidate.rel_path))
        {
            return true;
        }

        let Some(existing) = existing_by_key.get(&candidate_key).copied() else {
            return true;
        };

        existing.deleted_at_unix_ms.is_some()
            || existing.content_hash.is_empty()
            || existing.size_bytes != candidate.size_bytes
            || existing.mtime_unix_ms != candidate.mtime_unix_ms
    })
}

fn hash_candidates_with_filter(
    candidates: &[FileCandidate],
    should_hash: impl Fn(&FileCandidate) -> bool,
) -> HashCandidatesResult {
    let mut hashes = HashMap::new();
    let mut hashes_by_file_key = HashMap::new();
    let mut hash_failures = HashMap::new();
    let mut hash_failures_by_file_key = HashMap::new();
    let mut warnings = Vec::new();

    let pb = ProgressBar::new(candidates.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) Hashing")
            .unwrap()
            .progress_chars("#>-"),
    );

    for candidate in candidates {
        if should_hash(candidate) {
            hash_candidate(
                candidate,
                &mut hashes,
                &mut hashes_by_file_key,
                &mut hash_failures,
                &mut hash_failures_by_file_key,
                &mut warnings,
            );
        } else if let Err(err) = fs::File::open(&candidate.abs_path) {
            let message = format!(
                "failed to read file for hashing: {} ({err})",
                candidate.abs_path.display()
            );
            warn!("{message}");
            hash_failures.insert(candidate.rel_path.clone(), message.clone());
            hash_failures_by_file_key.insert(
                FileKey::new(candidate.root_id, candidate.rel_path.clone()),
                message.clone(),
            );
            warnings.push(message);
        }
        pb.inc(1);
    }

    pb.finish_and_clear();

    HashCandidatesResult {
        hashes,
        hashes_by_file_key,
        hash_failures,
        hash_failures_by_file_key,
        warnings,
    }
}

fn hash_candidate(
    candidate: &FileCandidate,
    hashes: &mut HashMap<String, String>,
    hashes_by_file_key: &mut HashMap<FileKey, String>,
    hash_failures: &mut HashMap<String, String>,
    hash_failures_by_file_key: &mut HashMap<FileKey, String>,
    warnings: &mut Vec<String>,
) {
    match fs::read(&candidate.abs_path) {
        Ok(content) => {
            let mut hasher = Hasher::new();
            hasher.update(&content);
            let hex = hasher.finalize().to_hex().to_string();
            hashes.insert(candidate.rel_path.clone(), hex.clone());
            hashes_by_file_key.insert(
                FileKey::new(candidate.root_id, candidate.rel_path.clone()),
                hex,
            );
        }
        Err(err) => {
            let message = format!(
                "failed to read file for hashing: {} ({err})",
                candidate.abs_path.display()
            );
            warn!("{message}");
            hash_failures.insert(candidate.rel_path.clone(), message.clone());
            hash_failures_by_file_key.insert(
                FileKey::new(candidate.root_id, candidate.rel_path.clone()),
                message.clone(),
            );
            warnings.push(message);
        }
    }
}
