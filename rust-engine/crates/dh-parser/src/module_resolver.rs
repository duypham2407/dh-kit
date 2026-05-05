//! TypeScript/JavaScript module resolver with bounded cross-root awareness.
//!
//! RGA-02 scope: classify module specifiers using filesystem probing, TS/JS
//! config aliases, and workspace package metadata. This module intentionally
//! returns resolved paths as metadata only; RGA-03 owns file-id linking.

use crate::ExtractionContext;
use serde_json::Value;
use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

const PROBE_EXTENSIONS: &[&str] = &["ts", "tsx", "js", "jsx", "mjs"];
const MAX_EXTENDS_DEPTH: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleResolutionStatus {
    Resolved,
    Unresolved,
    Ambiguous,
    External,
    Unsafe,
    Degraded,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleResolutionKind {
    Relative,
    Absolute,
    Alias,
    BaseUrl,
    WorkspacePackage,
    PackageExport,
    External,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleResolutionReason {
    RelativePathResolved,
    IndexFallbackResolved,
    AliasPathResolved,
    BaseUrlResolved,
    WorkspacePackageResolved,
    PackageExportResolved,
    CrossRootResolved,
    ExternalPackage,
    MissingSpecifier,
    NonLiteralSpecifier,
    MissingSourcePath,
    MissingRootContext,
    NotFound,
    AliasTargetNotFound,
    PackageTargetNotFound,
    AmbiguousCandidates,
    CrossRootAmbiguous,
    OutsideAllowedRoots,
    ConfigParseFailed,
    ConfigExtendsDepthExceeded,
    ConfigExtendsCycle,
    ConfigExtendsMissing,
    ConfigExtendsUnsupported,
    PackageMetadataMissing,
    PackageMetadataInvalid,
    PackageExportUnsupported,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModuleResolution {
    pub specifier: String,
    pub status: ModuleResolutionStatus,
    pub reason: ModuleResolutionReason,
    pub resolved_abs_path: Option<PathBuf>,
    pub resolution_kind: Option<ModuleResolutionKind>,
    pub config_path: Option<PathBuf>,
    pub source_root: Option<PathBuf>,
    pub target_root: Option<PathBuf>,
    pub confidence: f32,
    pub candidates: Vec<PathBuf>,
    pub detail: Option<String>,
}

impl ModuleResolution {
    #[must_use]
    pub fn to_resolution_error(&self) -> String {
        let mut parts = vec![
            format!("module_resolver: status={}", self.status.as_str()),
            format!("reason={}", self.reason.as_str()),
            format!("confidence={:.2}", self.confidence),
        ];

        if let Some(kind) = self.resolution_kind {
            parts.push(format!("kind={}", kind.as_str()));
        }
        if let Some(path) = &self.resolved_abs_path {
            parts.push(format!("resolved_abs_path={}", path.display()));
        }
        if let Some(path) = &self.config_path {
            parts.push(format!("config_path={}", path.display()));
        }
        if let Some(path) = &self.source_root {
            parts.push(format!("source_root={}", path.display()));
        }
        if let Some(path) = &self.target_root {
            parts.push(format!("target_root={}", path.display()));
        }
        if !self.candidates.is_empty() {
            let candidates = self
                .candidates
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(",");
            parts.push(format!("candidates=[{candidates}]"));
        }
        if let Some(detail) = &self.detail {
            parts.push(format!("detail={detail}"));
        }

        parts.join("; ")
    }

    #[must_use]
    pub fn from_resolution_error(value: &str) -> Option<Self> {
        let mut status = None;
        let mut reason = None;
        let mut confidence = None;
        let mut resolution_kind = None;
        let mut resolved_abs_path = None;
        let mut config_path = None;
        let mut source_root = None;
        let mut target_root = None;
        let mut detail = None;

        for part in value.split("; ").map(str::trim) {
            let Some((key, raw_value)) = part.split_once('=') else {
                continue;
            };
            let key = key
                .trim()
                .strip_prefix("module_resolver: ")
                .unwrap_or(key.trim());
            let raw_value = raw_value.trim();

            match key {
                "status" => status = parse_status(raw_value),
                "reason" => reason = parse_reason(raw_value),
                "confidence" => confidence = raw_value.parse::<f32>().ok(),
                "kind" => resolution_kind = parse_kind(raw_value),
                "resolved_abs_path" => resolved_abs_path = Some(PathBuf::from(raw_value)),
                "config_path" => config_path = Some(PathBuf::from(raw_value)),
                "source_root" => source_root = Some(PathBuf::from(raw_value)),
                "target_root" => target_root = Some(PathBuf::from(raw_value)),
                "detail" => detail = Some(raw_value.to_string()),
                _ => {}
            }
        }

        Some(Self {
            specifier: String::new(),
            status: status?,
            reason: reason?,
            resolved_abs_path,
            resolution_kind,
            config_path,
            source_root,
            target_root,
            confidence: confidence.unwrap_or(0.0),
            candidates: Vec::new(),
            detail,
        })
    }
}

impl ModuleResolutionStatus {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Resolved => "resolved",
            Self::Unresolved => "unresolved",
            Self::Ambiguous => "ambiguous",
            Self::External => "external",
            Self::Unsafe => "unsafe",
            Self::Degraded => "degraded",
        }
    }
}

impl ModuleResolutionKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Relative => "relative",
            Self::Absolute => "absolute",
            Self::Alias => "alias",
            Self::BaseUrl => "base_url",
            Self::WorkspacePackage => "workspace_package",
            Self::PackageExport => "package_export",
            Self::External => "external",
        }
    }
}

impl ModuleResolutionReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::RelativePathResolved => "relative_path_resolved",
            Self::IndexFallbackResolved => "index_fallback_resolved",
            Self::AliasPathResolved => "alias_path_resolved",
            Self::BaseUrlResolved => "base_url_resolved",
            Self::WorkspacePackageResolved => "workspace_package_resolved",
            Self::PackageExportResolved => "package_export_resolved",
            Self::CrossRootResolved => "cross_root_resolved",
            Self::ExternalPackage => "external_package",
            Self::MissingSpecifier => "missing_specifier",
            Self::NonLiteralSpecifier => "non_literal_specifier",
            Self::MissingSourcePath => "missing_source_path",
            Self::MissingRootContext => "missing_root_context",
            Self::NotFound => "not_found",
            Self::AliasTargetNotFound => "alias_target_not_found",
            Self::PackageTargetNotFound => "package_target_not_found",
            Self::AmbiguousCandidates => "ambiguous_candidates",
            Self::CrossRootAmbiguous => "cross_root_ambiguous",
            Self::OutsideAllowedRoots => "outside_allowed_roots",
            Self::ConfigParseFailed => "config_parse_failed",
            Self::ConfigExtendsDepthExceeded => "config_extends_depth_exceeded",
            Self::ConfigExtendsCycle => "config_extends_cycle",
            Self::ConfigExtendsMissing => "config_extends_missing",
            Self::ConfigExtendsUnsupported => "config_extends_unsupported",
            Self::PackageMetadataMissing => "package_metadata_missing",
            Self::PackageMetadataInvalid => "package_metadata_invalid",
            Self::PackageExportUnsupported => "package_export_unsupported",
        }
    }
}

fn parse_status(value: &str) -> Option<ModuleResolutionStatus> {
    Some(match value {
        "resolved" => ModuleResolutionStatus::Resolved,
        "unresolved" => ModuleResolutionStatus::Unresolved,
        "ambiguous" => ModuleResolutionStatus::Ambiguous,
        "external" => ModuleResolutionStatus::External,
        "unsafe" => ModuleResolutionStatus::Unsafe,
        "degraded" => ModuleResolutionStatus::Degraded,
        _ => return None,
    })
}

fn parse_kind(value: &str) -> Option<ModuleResolutionKind> {
    Some(match value {
        "relative" => ModuleResolutionKind::Relative,
        "absolute" => ModuleResolutionKind::Absolute,
        "alias" => ModuleResolutionKind::Alias,
        "base_url" => ModuleResolutionKind::BaseUrl,
        "workspace_package" => ModuleResolutionKind::WorkspacePackage,
        "package_export" => ModuleResolutionKind::PackageExport,
        "external" => ModuleResolutionKind::External,
        _ => return None,
    })
}

fn parse_reason(value: &str) -> Option<ModuleResolutionReason> {
    Some(match value {
        "relative_path_resolved" => ModuleResolutionReason::RelativePathResolved,
        "index_fallback_resolved" => ModuleResolutionReason::IndexFallbackResolved,
        "alias_path_resolved" => ModuleResolutionReason::AliasPathResolved,
        "base_url_resolved" => ModuleResolutionReason::BaseUrlResolved,
        "workspace_package_resolved" => ModuleResolutionReason::WorkspacePackageResolved,
        "package_export_resolved" => ModuleResolutionReason::PackageExportResolved,
        "cross_root_resolved" => ModuleResolutionReason::CrossRootResolved,
        "external_package" => ModuleResolutionReason::ExternalPackage,
        "missing_specifier" => ModuleResolutionReason::MissingSpecifier,
        "non_literal_specifier" => ModuleResolutionReason::NonLiteralSpecifier,
        "missing_source_path" => ModuleResolutionReason::MissingSourcePath,
        "missing_root_context" => ModuleResolutionReason::MissingRootContext,
        "not_found" => ModuleResolutionReason::NotFound,
        "alias_target_not_found" => ModuleResolutionReason::AliasTargetNotFound,
        "package_target_not_found" => ModuleResolutionReason::PackageTargetNotFound,
        "ambiguous_candidates" => ModuleResolutionReason::AmbiguousCandidates,
        "cross_root_ambiguous" => ModuleResolutionReason::CrossRootAmbiguous,
        "outside_allowed_roots" => ModuleResolutionReason::OutsideAllowedRoots,
        "config_parse_failed" => ModuleResolutionReason::ConfigParseFailed,
        "config_extends_depth_exceeded" => ModuleResolutionReason::ConfigExtendsDepthExceeded,
        "config_extends_cycle" => ModuleResolutionReason::ConfigExtendsCycle,
        "config_extends_missing" => ModuleResolutionReason::ConfigExtendsMissing,
        "config_extends_unsupported" => ModuleResolutionReason::ConfigExtendsUnsupported,
        "package_metadata_missing" => ModuleResolutionReason::PackageMetadataMissing,
        "package_metadata_invalid" => ModuleResolutionReason::PackageMetadataInvalid,
        "package_export_unsupported" => ModuleResolutionReason::PackageExportUnsupported,
        _ => return None,
    })
}

#[derive(Debug, Clone, Default)]
pub struct ResolverContext {
    pub source_path: Option<PathBuf>,
    pub workspace_root: Option<PathBuf>,
    pub workspace_roots: Vec<PathBuf>,
    pub package_roots: Vec<PathBuf>,
}

impl ResolverContext {
    #[must_use]
    pub fn from_extraction_context(ctx: &ExtractionContext<'_>) -> Self {
        let source_path = ctx.abs_path.clone().or_else(|| {
            ctx.workspace_root
                .as_ref()
                .map(|root| root.join(ctx.rel_path))
        });

        Self {
            source_path,
            workspace_root: ctx.workspace_root.clone(),
            workspace_roots: ctx.workspace_roots.clone(),
            package_roots: ctx.package_roots.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ModuleResolver {
    context: ResolverContext,
    allowed_roots: Vec<PathBuf>,
    package_roots: Vec<PathBuf>,
    packages: Vec<PackageMetadata>,
    config_cache: RefCell<HashMap<PathBuf, Result<TsConfig, ConfigLoadProblem>>>,
}

impl ModuleResolver {
    #[must_use]
    pub fn new(context: ResolverContext) -> Self {
        let mut allowed_roots = Vec::new();
        append_normalized_paths(&mut allowed_roots, context.workspace_roots.iter());
        if let Some(root) = &context.workspace_root {
            append_normalized_path(&mut allowed_roots, root);
        }
        append_normalized_paths(&mut allowed_roots, context.package_roots.iter());

        let mut package_roots = context.package_roots.clone();
        if package_roots.is_empty() {
            package_roots = discover_workspace_package_roots(&allowed_roots);
        }
        append_normalized_paths(&mut allowed_roots, package_roots.iter());
        dedupe_paths(&mut package_roots);
        dedupe_paths(&mut allowed_roots);

        let packages = package_roots
            .iter()
            .map(|root| load_package_metadata(root))
            .collect();

        Self {
            context,
            allowed_roots,
            package_roots,
            packages,
            config_cache: RefCell::new(HashMap::new()),
        }
    }

    #[must_use]
    pub fn from_extraction_context(ctx: &ExtractionContext<'_>) -> Self {
        Self::new(ResolverContext::from_extraction_context(ctx))
    }

    #[must_use]
    pub fn allowed_roots(&self) -> &[PathBuf] {
        &self.allowed_roots
    }

    #[must_use]
    pub fn package_roots(&self) -> &[PathBuf] {
        &self.package_roots
    }

    #[must_use]
    pub fn resolve(&self, specifier: &str) -> ModuleResolution {
        let specifier = specifier.trim();
        if specifier.is_empty() {
            return self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Unresolved,
                ModuleResolutionReason::MissingSpecifier,
                None,
                0.0,
                None,
            );
        }

        if specifier == "<dynamic-expression>" {
            return self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Degraded,
                ModuleResolutionReason::NonLiteralSpecifier,
                None,
                0.1,
                Some("import/require specifier is not a string literal".to_string()),
            );
        }

        if is_relative_specifier(specifier) {
            return self.resolve_relative(specifier);
        }

        if Path::new(specifier).is_absolute() {
            return self.resolve_absolute(specifier);
        }

        if let Some(resolution) = self.resolve_alias_or_base_url(specifier) {
            if !matches!(resolution.status, ModuleResolutionStatus::External) {
                return resolution;
            }
        }

        if let Some(resolution) = self.resolve_workspace_package(specifier) {
            return resolution;
        }

        self.basic_resolution(
            specifier,
            ModuleResolutionStatus::External,
            ModuleResolutionReason::ExternalPackage,
            Some(ModuleResolutionKind::External),
            1.0,
            None,
        )
    }

    fn resolve_relative(&self, specifier: &str) -> ModuleResolution {
        let Some(source_path) = self.source_path() else {
            return self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Degraded,
                ModuleResolutionReason::MissingSourcePath,
                Some(ModuleResolutionKind::Relative),
                0.1,
                None,
            );
        };

        if self.allowed_roots.is_empty() {
            return self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Degraded,
                ModuleResolutionReason::MissingRootContext,
                Some(ModuleResolutionKind::Relative),
                0.1,
                None,
            );
        }

        let Some(source_dir) = source_path.parent() else {
            return self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Degraded,
                ModuleResolutionReason::MissingSourcePath,
                Some(ModuleResolutionKind::Relative),
                0.1,
                None,
            );
        };

        let base = source_dir.join(specifier);
        match self.probe_path(&base) {
            PathProbe::Found {
                candidates,
                used_index,
            } => self.finalize_candidates(
                specifier,
                ModuleResolutionKind::Relative,
                candidates,
                if used_index {
                    ModuleResolutionReason::IndexFallbackResolved
                } else {
                    ModuleResolutionReason::RelativePathResolved
                },
                None,
            ),
            PathProbe::Unsafe { path } => self.unsafe_resolution(
                specifier,
                ModuleResolutionKind::Relative,
                path,
                "relative specifier escapes configured workspace/package roots".to_string(),
            ),
            PathProbe::NotFound => self.unresolved_resolution(
                specifier,
                ModuleResolutionReason::NotFound,
                Some(ModuleResolutionKind::Relative),
                None,
                None,
            ),
        }
    }

    fn resolve_absolute(&self, specifier: &str) -> ModuleResolution {
        if self.allowed_roots.is_empty() {
            return self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Degraded,
                ModuleResolutionReason::MissingRootContext,
                Some(ModuleResolutionKind::Absolute),
                0.1,
                None,
            );
        }

        let base = PathBuf::from(specifier);
        match self.probe_path(&base) {
            PathProbe::Found {
                candidates,
                used_index,
            } => self.finalize_candidates(
                specifier,
                ModuleResolutionKind::Absolute,
                candidates,
                if used_index {
                    ModuleResolutionReason::IndexFallbackResolved
                } else {
                    ModuleResolutionReason::RelativePathResolved
                },
                None,
            ),
            PathProbe::Unsafe { path } => self.unsafe_resolution(
                specifier,
                ModuleResolutionKind::Absolute,
                path,
                "absolute specifier is outside configured workspace/package roots".to_string(),
            ),
            PathProbe::NotFound => self.unresolved_resolution(
                specifier,
                ModuleResolutionReason::NotFound,
                Some(ModuleResolutionKind::Absolute),
                None,
                None,
            ),
        }
    }

    fn resolve_alias_or_base_url(&self, specifier: &str) -> Option<ModuleResolution> {
        let source_path = self.source_path()?;
        let config_path = match self.find_nearest_config(&source_path) {
            Some(path) => path,
            None => return None,
        };

        let config = match self.load_config_cached(&config_path) {
            Ok(config) => config,
            Err(problem) => {
                return Some(self.config_degraded_resolution(specifier, problem, config_path));
            }
        };

        let mut alias_matched = false;
        let mut candidates = Vec::new();
        let mut unsafe_path = None;

        for mapping in &config.paths {
            let Some(capture) = match_path_pattern(&mapping.pattern, specifier) else {
                continue;
            };
            alias_matched = true;
            for target in &mapping.targets {
                let target = apply_target_pattern(target, &capture);
                let target_path = path_from_base(&mapping.base_dir, &target);
                match self.probe_path(&target_path) {
                    PathProbe::Found {
                        candidates: found, ..
                    } => candidates.extend(found),
                    PathProbe::Unsafe { path } => unsafe_path = Some(path),
                    PathProbe::NotFound => {}
                }
            }
        }

        if let Some(path) = unsafe_path {
            return Some(self.unsafe_resolution(
                specifier,
                ModuleResolutionKind::Alias,
                path,
                "alias target escapes configured workspace/package roots".to_string(),
            ));
        }

        if alias_matched {
            return Some(if candidates.is_empty() {
                self.unresolved_resolution(
                    specifier,
                    ModuleResolutionReason::AliasTargetNotFound,
                    Some(ModuleResolutionKind::Alias),
                    Some(config.config_path),
                    Some(
                        "tsconfig/jsconfig path alias matched but no probed target exists"
                            .to_string(),
                    ),
                )
            } else {
                self.finalize_candidates(
                    specifier,
                    ModuleResolutionKind::Alias,
                    candidates,
                    ModuleResolutionReason::AliasPathResolved,
                    Some(config.config_path),
                )
            });
        }

        if let Some(base_url) = &config.base_url {
            match self.probe_path(&base_url.join(specifier)) {
                PathProbe::Found { candidates, .. } => {
                    return Some(self.finalize_candidates(
                        specifier,
                        ModuleResolutionKind::BaseUrl,
                        candidates,
                        ModuleResolutionReason::BaseUrlResolved,
                        Some(config.config_path),
                    ));
                }
                PathProbe::Unsafe { path } => {
                    return Some(self.unsafe_resolution(
                        specifier,
                        ModuleResolutionKind::BaseUrl,
                        path,
                        "baseUrl target escapes configured workspace/package roots".to_string(),
                    ));
                }
                PathProbe::NotFound => {}
            }
        }

        None
    }

    fn resolve_workspace_package(&self, specifier: &str) -> Option<ModuleResolution> {
        let mut matched_packages = Vec::new();

        for package in &self.packages {
            let Some(name) = &package.name else {
                continue;
            };
            if specifier == name
                || specifier
                    .strip_prefix(name)
                    .is_some_and(|rest| rest.starts_with('/'))
            {
                matched_packages.push(package);
            }
        }

        if matched_packages.is_empty() {
            return None;
        }

        if matched_packages
            .iter()
            .any(|package| package.invalid_metadata)
        {
            return Some(self.basic_resolution(
                specifier,
                ModuleResolutionStatus::Degraded,
                ModuleResolutionReason::PackageMetadataInvalid,
                Some(ModuleResolutionKind::WorkspacePackage),
                0.2,
                Some("one or more matching package.json files could not be parsed".to_string()),
            ));
        }

        let mut candidates = Vec::new();
        let mut unsafe_path = None;
        let mut export_used = false;
        let mut unsupported_export = false;

        for package in matched_packages {
            let name = package.name.as_deref().unwrap_or_default();
            let subpath = specifier
                .strip_prefix(name)
                .unwrap_or_default()
                .trim_start_matches('/');
            let (targets, used_exports, unsupported) = package.resolve_targets(subpath);
            export_used |= used_exports;
            unsupported_export |= unsupported;

            for target in targets {
                let target_path = path_from_base(&package.root, &target);
                if !path_is_within(&target_path, &package.root) {
                    unsafe_path = Some(target_path);
                    continue;
                }
                match self.probe_path(&target_path) {
                    PathProbe::Found {
                        candidates: found, ..
                    } => candidates.extend(found),
                    PathProbe::Unsafe { path } => unsafe_path = Some(path),
                    PathProbe::NotFound => {}
                }
            }
        }

        if let Some(path) = unsafe_path {
            return Some(self.unsafe_resolution(
                specifier,
                ModuleResolutionKind::PackageExport,
                path,
                "workspace package target escapes its package root or allowed roots".to_string(),
            ));
        }

        if candidates.is_empty() {
            return Some(self.unresolved_resolution(
                specifier,
                if unsupported_export {
                    ModuleResolutionReason::PackageExportUnsupported
                } else {
                    ModuleResolutionReason::PackageTargetNotFound
                },
                Some(if export_used {
                    ModuleResolutionKind::PackageExport
                } else {
                    ModuleResolutionKind::WorkspacePackage
                }),
                None,
                Some(
                    "workspace package name matched but no package entry target exists".to_string(),
                ),
            ));
        }

        Some(self.finalize_candidates(
            specifier,
            if export_used {
                ModuleResolutionKind::PackageExport
            } else {
                ModuleResolutionKind::WorkspacePackage
            },
            candidates,
            if export_used {
                ModuleResolutionReason::PackageExportResolved
            } else {
                ModuleResolutionReason::WorkspacePackageResolved
            },
            None,
        ))
    }

    fn finalize_candidates(
        &self,
        specifier: &str,
        kind: ModuleResolutionKind,
        candidates: Vec<PathBuf>,
        resolved_reason: ModuleResolutionReason,
        config_path: Option<PathBuf>,
    ) -> ModuleResolution {
        let mut candidates = normalize_dedup_sort(candidates);
        let source_root = self
            .source_path()
            .and_then(|path| self.best_root_for(&path));

        if candidates.len() > 1 {
            let roots = candidates
                .iter()
                .filter_map(|candidate| self.best_root_for(candidate))
                .collect::<BTreeSet<_>>();
            return ModuleResolution {
                specifier: specifier.to_string(),
                status: ModuleResolutionStatus::Ambiguous,
                reason: if roots.len() > 1 {
                    ModuleResolutionReason::CrossRootAmbiguous
                } else {
                    ModuleResolutionReason::AmbiguousCandidates
                },
                resolved_abs_path: None,
                resolution_kind: Some(kind),
                config_path,
                source_root,
                target_root: None,
                confidence: 0.4,
                candidates,
                detail: Some("specifier matched multiple existing module candidates".to_string()),
            };
        }

        let Some(resolved_abs_path) = candidates.pop() else {
            return self.unresolved_resolution(
                specifier,
                ModuleResolutionReason::NotFound,
                Some(kind),
                config_path,
                None,
            );
        };
        let target_root = self.best_root_for(&resolved_abs_path);
        let is_cross_root =
            source_root.is_some() && target_root.is_some() && source_root != target_root;

        ModuleResolution {
            specifier: specifier.to_string(),
            status: ModuleResolutionStatus::Resolved,
            reason: if is_cross_root {
                ModuleResolutionReason::CrossRootResolved
            } else {
                resolved_reason
            },
            resolved_abs_path: Some(resolved_abs_path),
            resolution_kind: Some(kind),
            config_path,
            source_root,
            target_root,
            confidence: if is_cross_root { 0.9 } else { 1.0 },
            candidates: Vec::new(),
            detail: None,
        }
    }

    fn unresolved_resolution(
        &self,
        specifier: &str,
        reason: ModuleResolutionReason,
        kind: Option<ModuleResolutionKind>,
        config_path: Option<PathBuf>,
        detail: Option<String>,
    ) -> ModuleResolution {
        ModuleResolution {
            specifier: specifier.to_string(),
            status: ModuleResolutionStatus::Unresolved,
            reason,
            resolved_abs_path: None,
            resolution_kind: kind,
            config_path,
            source_root: self
                .source_path()
                .and_then(|path| self.best_root_for(&path)),
            target_root: None,
            confidence: 0.0,
            candidates: Vec::new(),
            detail,
        }
    }

    fn unsafe_resolution(
        &self,
        specifier: &str,
        kind: ModuleResolutionKind,
        path: PathBuf,
        detail: String,
    ) -> ModuleResolution {
        ModuleResolution {
            specifier: specifier.to_string(),
            status: ModuleResolutionStatus::Unsafe,
            reason: ModuleResolutionReason::OutsideAllowedRoots,
            resolved_abs_path: None,
            resolution_kind: Some(kind),
            config_path: None,
            source_root: self
                .source_path()
                .and_then(|path| self.best_root_for(&path)),
            target_root: None,
            confidence: 0.0,
            candidates: vec![normalize_path_lexically(&path)],
            detail: Some(detail),
        }
    }

    fn basic_resolution(
        &self,
        specifier: &str,
        status: ModuleResolutionStatus,
        reason: ModuleResolutionReason,
        kind: Option<ModuleResolutionKind>,
        confidence: f32,
        detail: Option<String>,
    ) -> ModuleResolution {
        ModuleResolution {
            specifier: specifier.to_string(),
            status,
            reason,
            resolved_abs_path: None,
            resolution_kind: kind,
            config_path: None,
            source_root: self
                .source_path()
                .and_then(|path| self.best_root_for(&path)),
            target_root: None,
            confidence,
            candidates: Vec::new(),
            detail,
        }
    }

    fn config_degraded_resolution(
        &self,
        specifier: &str,
        problem: ConfigLoadProblem,
        config_path: PathBuf,
    ) -> ModuleResolution {
        ModuleResolution {
            specifier: specifier.to_string(),
            status: ModuleResolutionStatus::Degraded,
            reason: problem.reason(),
            resolved_abs_path: None,
            resolution_kind: Some(ModuleResolutionKind::Alias),
            config_path: Some(config_path),
            source_root: self
                .source_path()
                .and_then(|path| self.best_root_for(&path)),
            target_root: None,
            confidence: 0.1,
            candidates: Vec::new(),
            detail: Some(problem.detail()),
        }
    }

    fn source_path(&self) -> Option<PathBuf> {
        self.context
            .source_path
            .as_ref()
            .map(|path| canonicalize_if_exists(path))
    }

    fn best_root_for(&self, path: &Path) -> Option<PathBuf> {
        let path = canonicalize_if_exists(path);
        self.allowed_roots
            .iter()
            .filter(|root| path.starts_with(root.as_path()) || path == **root)
            .max_by_key(|root| root.components().count())
            .cloned()
    }

    fn probe_path(&self, base: &Path) -> PathProbe {
        if self.allowed_roots.is_empty() {
            return PathProbe::Unsafe {
                path: normalize_path_lexically(base),
            };
        }

        let base = normalize_path_lexically(base);
        if !self.is_allowed_path(&base) {
            return PathProbe::Unsafe { path: base };
        }

        let base_without_ext = if base.extension().is_some() {
            Some(base.with_extension(""))
        } else {
            None
        };

        let exact_bases = std::iter::once(base.as_path()).chain(base_without_ext.as_deref());
        for exact_base in exact_bases {
            if exact_base.is_file() {
                let exact = canonicalize_if_exists(exact_base);
                return if self.is_allowed_path(&exact) {
                    PathProbe::Found {
                        candidates: vec![exact],
                        used_index: false,
                    }
                } else {
                    PathProbe::Unsafe { path: exact }
                };
            }
        }

        let probe_base = base_without_ext.as_ref().unwrap_or(&base);
        for ext in PROBE_EXTENSIONS {
            let candidate = probe_base.with_extension(ext);
            if candidate.is_file() {
                let candidate = canonicalize_if_exists(&candidate);
                return if self.is_allowed_path(&candidate) {
                    PathProbe::Found {
                        candidates: vec![candidate],
                        used_index: false,
                    }
                } else {
                    PathProbe::Unsafe { path: candidate }
                };
            }
        }

        for ext in PROBE_EXTENSIONS {
            let candidate = probe_base.join(format!("index.{ext}"));
            if candidate.is_file() {
                let candidate = canonicalize_if_exists(&candidate);
                return if self.is_allowed_path(&candidate) {
                    PathProbe::Found {
                        candidates: vec![candidate],
                        used_index: true,
                    }
                } else {
                    PathProbe::Unsafe { path: candidate }
                };
            }
        }

        PathProbe::NotFound
    }

    fn is_allowed_path(&self, path: &Path) -> bool {
        self.allowed_roots
            .iter()
            .any(|root| path_is_within(path, root))
    }

    fn find_nearest_config(&self, source_path: &Path) -> Option<PathBuf> {
        let mut dir = source_path.parent()?.to_path_buf();
        let boundary = self.best_root_for(source_path);

        loop {
            for file_name in ["tsconfig.json", "jsconfig.json"] {
                let candidate = dir.join(file_name);
                if candidate.is_file() {
                    return Some(canonicalize_if_exists(&candidate));
                }
            }

            if boundary.as_ref().is_some_and(|root| *root == dir) {
                break;
            }
            if !dir.pop() {
                break;
            }
        }

        None
    }

    fn load_config_cached(&self, config_path: &Path) -> Result<TsConfig, ConfigLoadProblem> {
        let key = canonicalize_if_exists(config_path);
        if let Some(cached) = self.config_cache.borrow().get(&key) {
            return cached.clone();
        }

        let result = load_ts_config_recursive(&key, 0, &mut HashSet::new());
        self.config_cache.borrow_mut().insert(key, result.clone());
        result
    }
}

#[derive(Debug, Clone)]
enum PathProbe {
    Found {
        candidates: Vec<PathBuf>,
        used_index: bool,
    },
    Unsafe {
        path: PathBuf,
    },
    NotFound,
}

#[derive(Debug, Clone)]
struct PathMapping {
    pattern: String,
    targets: Vec<String>,
    base_dir: PathBuf,
}

#[derive(Debug, Clone)]
struct TsConfig {
    config_path: PathBuf,
    base_url: Option<PathBuf>,
    paths: Vec<PathMapping>,
}

#[derive(Debug, Clone)]
enum ConfigLoadProblem {
    Parse { path: PathBuf, message: String },
    ExtendsDepthExceeded { path: PathBuf },
    ExtendsCycle { path: PathBuf },
    ExtendsMissing { path: PathBuf },
    ExtendsUnsupported { value: String },
}

impl ConfigLoadProblem {
    const fn reason(&self) -> ModuleResolutionReason {
        match self {
            Self::Parse { .. } => ModuleResolutionReason::ConfigParseFailed,
            Self::ExtendsDepthExceeded { .. } => ModuleResolutionReason::ConfigExtendsDepthExceeded,
            Self::ExtendsCycle { .. } => ModuleResolutionReason::ConfigExtendsCycle,
            Self::ExtendsMissing { .. } => ModuleResolutionReason::ConfigExtendsMissing,
            Self::ExtendsUnsupported { .. } => ModuleResolutionReason::ConfigExtendsUnsupported,
        }
    }

    fn detail(&self) -> String {
        match self {
            Self::Parse { path, message } => {
                format!("failed to parse {}: {message}", path.display())
            }
            Self::ExtendsDepthExceeded { path } => {
                format!(
                    "tsconfig/jsconfig extends depth exceeded at {}",
                    path.display()
                )
            }
            Self::ExtendsCycle { path } => {
                format!("tsconfig/jsconfig extends cycle at {}", path.display())
            }
            Self::ExtendsMissing { path } => {
                format!("extended tsconfig/jsconfig not found: {}", path.display())
            }
            Self::ExtendsUnsupported { value } => {
                format!("package-style tsconfig/jsconfig extends is unsupported: {value}")
            }
        }
    }
}

#[derive(Debug, Clone)]
struct PackageMetadata {
    root: PathBuf,
    name: Option<String>,
    exports: Option<Value>,
    entry_fields: Vec<String>,
    invalid_metadata: bool,
}

impl PackageMetadata {
    fn resolve_targets(&self, subpath: &str) -> (Vec<String>, bool, bool) {
        if let Some(exports) = &self.exports {
            let (targets, unsupported) = export_targets(exports, subpath);
            if !targets.is_empty() || unsupported {
                return (targets, true, unsupported);
            }
        }

        if subpath.is_empty() {
            let mut targets = self.entry_fields.clone();
            targets.push(".".to_string());
            return (targets, false, false);
        }

        (vec![subpath.to_string()], false, false)
    }
}

fn load_ts_config_recursive(
    path: &Path,
    depth: usize,
    visited: &mut HashSet<PathBuf>,
) -> Result<TsConfig, ConfigLoadProblem> {
    let path = canonicalize_if_exists(path);
    if depth > MAX_EXTENDS_DEPTH {
        return Err(ConfigLoadProblem::ExtendsDepthExceeded { path });
    }
    if !visited.insert(path.clone()) {
        return Err(ConfigLoadProblem::ExtendsCycle { path });
    }

    let content = fs::read_to_string(&path).map_err(|err| ConfigLoadProblem::Parse {
        path: path.clone(),
        message: err.to_string(),
    })?;
    let stripped = strip_json_comments_and_trailing_commas(&content);
    let value: Value = serde_json::from_str(&stripped).map_err(|err| ConfigLoadProblem::Parse {
        path: path.clone(),
        message: err.to_string(),
    })?;

    let config_dir = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    let mut config = if let Some(extends) = value.get("extends").and_then(Value::as_str) {
        let parent = resolve_extends_path(&config_dir, extends)?;
        load_ts_config_recursive(&parent, depth + 1, visited)?
    } else {
        TsConfig {
            config_path: path.clone(),
            base_url: None,
            paths: Vec::new(),
        }
    };

    config.config_path = path.clone();

    let compiler_options = value.get("compilerOptions").and_then(Value::as_object);
    if let Some(options) = compiler_options {
        if let Some(base_url) = options.get("baseUrl").and_then(Value::as_str) {
            config.base_url = Some(path_from_base(&config_dir, base_url));
        }

        if let Some(paths) = options.get("paths").and_then(Value::as_object) {
            let base_dir = config
                .base_url
                .clone()
                .unwrap_or_else(|| config_dir.clone());

            for (pattern, target_value) in paths {
                let targets = if let Some(array) = target_value.as_array() {
                    array
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                } else {
                    target_value
                        .as_str()
                        .map(|target| vec![target.to_string()])
                        .unwrap_or_default()
                };

                config.paths.retain(|mapping| mapping.pattern != *pattern);
                config.paths.push(PathMapping {
                    pattern: pattern.clone(),
                    targets,
                    base_dir: base_dir.clone(),
                });
            }
        }
    }

    Ok(config)
}

fn resolve_extends_path(config_dir: &Path, extends: &str) -> Result<PathBuf, ConfigLoadProblem> {
    if !(extends.starts_with('.') || extends.starts_with('/')) {
        return Err(ConfigLoadProblem::ExtendsUnsupported {
            value: extends.to_string(),
        });
    }

    let raw = path_from_base(config_dir, extends);
    let candidates = if raw.extension().is_some() {
        vec![raw.clone(), raw.join("tsconfig.json")]
    } else {
        vec![
            raw.clone(),
            raw.with_extension("json"),
            raw.join("tsconfig.json"),
        ]
    };

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .map(|candidate| canonicalize_if_exists(&candidate))
        .ok_or(ConfigLoadProblem::ExtendsMissing { path: raw })
}

fn load_package_metadata(root: &Path) -> PackageMetadata {
    let root = canonicalize_if_exists(root);
    let package_json = root.join("package.json");
    if !package_json.is_file() {
        return PackageMetadata {
            root,
            name: None,
            exports: None,
            entry_fields: Vec::new(),
            invalid_metadata: false,
        };
    }

    let content = match fs::read_to_string(&package_json) {
        Ok(content) => content,
        Err(_) => {
            return PackageMetadata {
                root,
                name: None,
                exports: None,
                entry_fields: Vec::new(),
                invalid_metadata: true,
            };
        }
    };

    let stripped = strip_json_comments_and_trailing_commas(&content);
    let Ok(value) = serde_json::from_str::<Value>(&stripped) else {
        return PackageMetadata {
            root,
            name: None,
            exports: None,
            entry_fields: Vec::new(),
            invalid_metadata: true,
        };
    };

    let name = value
        .get("name")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let exports = value.get("exports").cloned();
    let entry_fields = ["types", "module", "main", "browser"]
        .iter()
        .filter_map(|key| value.get(*key).and_then(Value::as_str))
        .map(ToString::to_string)
        .collect();

    PackageMetadata {
        root,
        name,
        exports,
        entry_fields,
        invalid_metadata: false,
    }
}

fn export_targets(exports: &Value, subpath: &str) -> (Vec<String>, bool) {
    if subpath.is_empty() {
        if let Some(target) = first_export_string(exports) {
            return (vec![target], false);
        }
    }

    let Some(exports_object) = exports.as_object() else {
        return (Vec::new(), !exports.is_string());
    };

    let export_key = if subpath.is_empty() {
        ".".to_string()
    } else {
        format!("./{subpath}")
    };

    if let Some(target) = exports_object
        .get(&export_key)
        .and_then(first_export_string)
    {
        return (vec![target], false);
    }

    for (pattern, target_value) in exports_object {
        let Some(capture) = match_path_pattern(pattern, &export_key) else {
            continue;
        };
        if let Some(target) = first_export_string(target_value) {
            return (vec![apply_target_pattern(&target, &capture)], false);
        }
        return (Vec::new(), true);
    }

    (Vec::new(), false)
}

fn first_export_string(value: &Value) -> Option<String> {
    if let Some(value) = value.as_str() {
        return Some(value.to_string());
    }

    let object = value.as_object()?;
    for key in [
        "types", "import", "module", "require", "default", "browser", "node",
    ] {
        if let Some(target) = object.get(key).and_then(first_export_string) {
            return Some(target);
        }
    }
    None
}

fn strip_json_comments_and_trailing_commas(input: &str) -> String {
    strip_trailing_commas(&strip_json_comments(input))
}

fn strip_json_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;

    while let Some(ch) = chars.next() {
        if in_string {
            output.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
            output.push(ch);
            continue;
        }

        if ch == '/' {
            match chars.peek().copied() {
                Some('/') => {
                    chars.next();
                    for next in chars.by_ref() {
                        if next == '\n' {
                            output.push('\n');
                            break;
                        }
                    }
                    continue;
                }
                Some('*') => {
                    chars.next();
                    let mut previous = '\0';
                    for next in chars.by_ref() {
                        if next == '\n' {
                            output.push('\n');
                        }
                        if previous == '*' && next == '/' {
                            break;
                        }
                        previous = next;
                    }
                    continue;
                }
                _ => {}
            }
        }

        output.push(ch);
    }

    output
}

fn strip_trailing_commas(input: &str) -> String {
    let chars = input.chars().collect::<Vec<_>>();
    let mut output = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;

    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        if in_string {
            output.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            index += 1;
            continue;
        }

        if ch == '"' {
            in_string = true;
            output.push(ch);
            index += 1;
            continue;
        }

        if ch == ',' {
            let mut lookahead = index + 1;
            while lookahead < chars.len() && chars[lookahead].is_whitespace() {
                lookahead += 1;
            }
            if matches!(chars.get(lookahead), Some('}') | Some(']')) {
                index += 1;
                continue;
            }
        }

        output.push(ch);
        index += 1;
    }

    output
}

fn match_path_pattern(pattern: &str, specifier: &str) -> Option<String> {
    let star_count = pattern.matches('*').count();
    if star_count == 0 {
        return (pattern == specifier).then(String::new);
    }
    if star_count != 1 {
        return None;
    }

    let (prefix, suffix) = pattern.split_once('*')?;
    if !specifier.starts_with(prefix) || !specifier.ends_with(suffix) {
        return None;
    }
    if specifier.len() < prefix.len() + suffix.len() {
        return None;
    }

    Some(specifier[prefix.len()..specifier.len() - suffix.len()].to_string())
}

fn apply_target_pattern(target: &str, capture: &str) -> String {
    if target.matches('*').count() == 1 {
        target.replacen('*', capture, 1)
    } else {
        target.to_string()
    }
}

fn is_relative_specifier(specifier: &str) -> bool {
    specifier == "."
        || specifier == ".."
        || specifier.starts_with("./")
        || specifier.starts_with("../")
}

fn path_from_base(base: &Path, target: &str) -> PathBuf {
    let target_path = Path::new(target);
    let joined = if target_path.is_absolute() {
        target_path.to_path_buf()
    } else {
        base.join(target_path)
    };
    normalize_path_lexically(&joined)
}

fn discover_workspace_package_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut package_roots = Vec::new();
    for root in roots {
        if root.join("package.json").is_file() {
            package_roots.push(root.clone());
        }

        for container in ["packages", "apps"] {
            let container_path = root.join(container);
            let Ok(entries) = fs::read_dir(&container_path) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.join("package.json").is_file() {
                    package_roots.push(canonicalize_if_exists(&path));
                    continue;
                }

                let is_scope_dir = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with('@'));
                if is_scope_dir {
                    if let Ok(scoped_entries) = fs::read_dir(&path) {
                        for scoped_entry in scoped_entries.flatten() {
                            let scoped_path = scoped_entry.path();
                            if scoped_path.join("package.json").is_file() {
                                package_roots.push(canonicalize_if_exists(&scoped_path));
                            }
                        }
                    }
                }
            }
        }
    }
    dedupe_paths(&mut package_roots);
    package_roots
}

fn append_normalized_paths<'a>(
    target: &mut Vec<PathBuf>,
    paths: impl Iterator<Item = &'a PathBuf>,
) {
    for path in paths {
        append_normalized_path(target, path);
    }
}

fn append_normalized_path(target: &mut Vec<PathBuf>, path: &Path) {
    target.push(canonicalize_if_exists(path));
}

fn normalize_dedup_sort(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut set = BTreeSet::new();
    for path in paths {
        set.insert(canonicalize_if_exists(&path));
    }
    set.into_iter().collect()
}

fn dedupe_paths(paths: &mut Vec<PathBuf>) {
    let mut set = BTreeSet::new();
    paths.retain(|path| set.insert(canonicalize_if_exists(path)));
    for path in paths {
        *path = canonicalize_if_exists(path);
    }
}

fn canonicalize_if_exists(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| normalize_path_lexically(path))
}

fn normalize_path_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    let absolute = path.is_absolute();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() && !absolute {
                    normalized.push("..");
                }
            }
            Component::Normal(value) => normalized.push(value),
        }
    }

    if normalized.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        normalized
    }
}

fn path_is_within(path: &Path, root: &Path) -> bool {
    let path = canonicalize_if_exists(path);
    let root = canonicalize_if_exists(root);
    path == root || path.starts_with(root)
}
