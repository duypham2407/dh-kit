use dh_types::{File, FileCandidate, FileId};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Default)]
pub struct DirtySet {
    pub to_index: Vec<FileCandidate>,
    pub to_delete: Vec<FileId>,
}

pub fn build_dirty_set(
    scanned: &[FileCandidate],
    content_hashes: &HashMap<String, String>,
    existing_files: &[File],
    force_full: bool,
) -> DirtySet {
    let existing_by_path = existing_files
        .iter()
        .map(|file| (file.rel_path.clone(), file))
        .collect::<HashMap<_, _>>();

    let scanned_paths = scanned
        .iter()
        .map(|candidate| candidate.rel_path.as_str())
        .collect::<HashSet<_>>();

    let mut to_index = Vec::new();

    for candidate in scanned {
        let Some(content_hash) = content_hashes.get(&candidate.rel_path) else {
            continue;
        };

        let should_index = if force_full {
            true
        } else {
            match existing_by_path.get(candidate.rel_path.as_str()) {
                None => true,
                Some(existing) => {
                    existing.deleted_at_unix_ms.is_some()
                        || existing.content_hash != *content_hash
                        || existing.mtime_unix_ms != candidate.mtime_unix_ms
                }
            }
        };

        if should_index {
            to_index.push(candidate.clone());
        }
    }

    let to_delete = existing_files
        .iter()
        .filter(|file| file.deleted_at_unix_ms.is_none())
        .filter(|file| !scanned_paths.contains(file.rel_path.as_str()))
        .map(|file| file.id)
        .collect::<Vec<_>>();

    DirtySet { to_index, to_delete }
}
