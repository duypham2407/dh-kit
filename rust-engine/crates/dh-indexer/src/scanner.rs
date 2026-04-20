use dh_types::{FileCandidate, LanguageId, WorkspaceId};
use ignore::WalkBuilder;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const HARDCODED_EXCLUDES: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".next",
];

#[derive(Debug, Clone)]
pub struct ScanConfig {
    pub workspace_id: WorkspaceId,
    pub root_id: i64,
    pub package_id: Option<i64>,
}

pub fn scan_workspace(root: &Path, config: &ScanConfig) -> anyhow::Result<Vec<FileCandidate>> {
    let mut candidates = Vec::new();
    let exclude_set = HARDCODED_EXCLUDES.iter().copied().collect::<HashSet<_>>();
    let exclude_set_for_filter = exclude_set.clone();

    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .ignore(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
        .require_git(false);

    builder.filter_entry(move |entry| {
        let path = entry.path();
        let is_excluded = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| exclude_set_for_filter.contains(name))
            .unwrap_or(false);
        !is_excluded
    });

    let walker = builder.build();

    for result in walker {
        let entry = match result {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let path = entry.path();

        if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| exclude_set.contains(name))
                .unwrap_or(false)
        {
            continue;
        }

        if !entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
        {
            continue;
        }

        let Some(language) = detect_language(path) else {
            continue;
        };

        let Ok(rel_path) = path.strip_prefix(root) else {
            continue;
        };

        let rel_path = normalize_rel_path(rel_path);
        let abs_path = PathBuf::from(path);

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        let size_bytes = metadata.len();
        let mtime_unix_ms = metadata
            .modified()
            .ok()
            .and_then(|mtime| mtime.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0);

        #[cfg(unix)]
        let executable = {
            use std::os::unix::fs::PermissionsExt;
            metadata.permissions().mode() & 0o111 != 0
        };

        #[cfg(not(unix))]
        let executable = false;

        candidates.push(FileCandidate {
            abs_path,
            rel_path,
            workspace_id: config.workspace_id,
            root_id: config.root_id,
            package_id: config.package_id,
            language,
            size_bytes,
            mtime_unix_ms,
            executable,
            shebang: None,
        });
    }

    candidates.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(candidates)
}

fn detect_language(path: &Path) -> Option<LanguageId> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase());

    if let Some(file_name) = file_name {
        if is_resolution_scope_file_name(&file_name) {
            return Some(LanguageId::Unknown);
        }
    }

    let ext = path.extension().and_then(|ext| ext.to_str())?;
    match ext {
        "ts" => Some(LanguageId::TypeScript),
        "tsx" => Some(LanguageId::Tsx),
        "js" => Some(LanguageId::JavaScript),
        "jsx" => Some(LanguageId::Jsx),
        _ => None,
    }
}

fn is_resolution_scope_file_name(file_name: &str) -> bool {
    (file_name.starts_with("tsconfig") && file_name.ends_with(".json"))
        || file_name == "jsconfig.json"
        || file_name == "cargo.toml"
        || file_name == "go.mod"
}

fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
