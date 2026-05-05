use dh_types::{File, FileCandidate, FileId};
use std::collections::{HashMap, HashSet};

use crate::hasher::FileKey;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidationLevel {
    ContentOnly,
    StructuralLocal,
    Dependent,
    ResolutionScope,
}

#[derive(Debug, Clone)]
pub struct PlannedFile {
    pub candidate: FileCandidate,
    pub level: InvalidationLevel,
    pub reason: String,
    pub triggered_by: String,
}

#[derive(Debug, Default)]
pub struct DirtySet {
    pub to_index: Vec<PlannedFile>,
    pub to_delete: Vec<FileId>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ConfirmedDelta {
    pub structure_changed: bool,
    pub public_api_changed: bool,
}

pub struct DirtyPlannerInput<'a> {
    pub scanned: &'a [FileCandidate],
    pub content_hashes: &'a HashMap<String, String>,
    pub content_hashes_by_file_key: &'a HashMap<FileKey, String>,
    pub existing_files: &'a [File],
    pub force_full: bool,
    pub expand_dependents: bool,
    pub touched_paths: Option<&'a [String]>,
    pub touched_file_keys: Option<&'a [FileKey]>,
}

pub fn build_dirty_set(input: DirtyPlannerInput<'_>) -> DirtySet {
    let existing_by_key = input
        .existing_files
        .iter()
        .map(|file| (FileKey::new(file.root_id, file.rel_path.clone()), file))
        .collect::<HashMap<_, _>>();

    let scanned_keys = input
        .scanned
        .iter()
        .map(|candidate| FileKey::new(candidate.root_id, candidate.rel_path.clone()))
        .collect::<HashSet<_>>();

    let touched_path_set = input
        .touched_paths
        .map(|paths| {
            paths
                .iter()
                .map(|path| path.replace('\\', "/"))
                .collect::<HashSet<_>>()
        })
        .unwrap_or_default();
    let touched_key_set = input
        .touched_file_keys
        .map(|keys| keys.iter().cloned().collect::<HashSet<_>>())
        .unwrap_or_default();

    let mut to_index = Vec::new();

    for candidate in input.scanned {
        let normalized_path = candidate.rel_path.replace('\\', "/");
        let file_key = FileKey::new(candidate.root_id, candidate.rel_path.clone());
        let explicitly_touched = touched_key_set.contains(&file_key)
            || (touched_key_set.is_empty()
                && !touched_path_set.is_empty()
                && touched_path_set.contains(&normalized_path));

        let Some(content_hash) = input.content_hashes_by_file_key.get(&file_key).or_else(|| {
            input
                .content_hashes
                .get(&candidate.rel_path)
                .filter(|_| input.content_hashes_by_file_key.is_empty())
        }) else {
            continue;
        };

        let existing = existing_by_key.get(&file_key).copied();
        let planner_outcome = plan_candidate(
            candidate,
            existing,
            content_hash,
            input.force_full,
            explicitly_touched,
        );

        if let Some((level, reason)) = planner_outcome {
            to_index.push(PlannedFile {
                candidate: candidate.clone(),
                level,
                reason,
                triggered_by: candidate.rel_path.clone(),
            });
        }
    }

    let mut to_delete = input
        .existing_files
        .iter()
        .filter(|file| file.deleted_at_unix_ms.is_none())
        .filter(|file| !scanned_keys.contains(&FileKey::new(file.root_id, file.rel_path.clone())))
        .map(|file| file.id)
        .collect::<Vec<_>>();
    to_delete.sort_unstable();
    to_delete.dedup();

    to_index.sort_by(|left, right| left.candidate.rel_path.cmp(&right.candidate.rel_path));

    DirtySet {
        to_index,
        to_delete,
    }
}

fn plan_candidate(
    candidate: &FileCandidate,
    existing: Option<&File>,
    content_hash: &str,
    force_full: bool,
    explicitly_touched: bool,
) -> Option<(InvalidationLevel, String)> {
    if force_full {
        return Some((
            InvalidationLevel::ResolutionScope,
            "forced full run requested by caller".to_string(),
        ));
    }

    let existing = match existing {
        Some(existing) => existing,
        None => {
            return Some((
                InvalidationLevel::ContentOnly,
                "new file path discovered".to_string(),
            ));
        }
    };

    if existing.deleted_at_unix_ms.is_some() {
        return Some((
            InvalidationLevel::ContentOnly,
            "previously deleted path reintroduced".to_string(),
        ));
    }

    let content_changed = existing.content_hash != content_hash;

    if !content_changed {
        if explicitly_touched {
            return Some((
                InvalidationLevel::ContentOnly,
                "path-scoped reindex request for unchanged file".to_string(),
            ));
        }
        return None;
    }

    let level = if is_resolution_scope_path(&candidate.rel_path) {
        InvalidationLevel::ResolutionScope
    } else {
        InvalidationLevel::ContentOnly
    };

    let reason = match level {
        InvalidationLevel::ContentOnly => "confirmed content hash change".to_string(),
        InvalidationLevel::StructuralLocal => {
            "structural-local re-evaluation requested".to_string()
        }
        InvalidationLevel::Dependent => "dependent re-evaluation requested".to_string(),
        InvalidationLevel::ResolutionScope => {
            "resolution-basis file content changed; broader invalidation required".to_string()
        }
    };

    Some((level, reason))
}

pub fn is_resolution_scope_path(rel_path: &str) -> bool {
    let normalized = rel_path.replace('\\', "/");
    let file_name = normalized
        .rsplit('/')
        .next()
        .unwrap_or(normalized.as_str())
        .to_ascii_lowercase();

    (file_name.starts_with("tsconfig") && file_name.ends_with(".json"))
        || file_name == "jsconfig.json"
        || file_name == "cargo.toml"
        || file_name == "go.mod"
}

pub fn confirmed_delta(before: Option<&File>, after: &File) -> ConfirmedDelta {
    let Some(before) = before else {
        return ConfirmedDelta::default();
    };

    ConfirmedDelta {
        structure_changed: before.structure_hash.as_deref() != after.structure_hash.as_deref(),
        public_api_changed: before.public_api_hash.as_deref() != after.public_api_hash.as_deref(),
    }
}
