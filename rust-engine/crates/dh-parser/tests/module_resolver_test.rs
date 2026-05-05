use dh_parser::module_resolver::{
    ModuleResolutionKind, ModuleResolutionReason, ModuleResolutionStatus, ModuleResolver,
};
use dh_parser::ExtractionContext;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

struct TestRoot {
    path: PathBuf,
}

impl TestRoot {
    fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "dh_parser_module_resolver_{name}_{}_{}",
            std::process::id(),
            suffix
        ));
        fs::create_dir_all(&path).expect("test root should be created");
        Self { path }
    }
}

impl Drop for TestRoot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn write_file(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("parent directory should be created");
    }
    fs::write(path, content).expect("fixture file should be written");
}

fn ctx_for<'a>(
    source: &'a str,
    rel_path: &'a str,
    abs_path: &Path,
    workspace_root: &Path,
    workspace_roots: Vec<PathBuf>,
    package_roots: Vec<PathBuf>,
) -> ExtractionContext<'a> {
    ExtractionContext {
        workspace_id: 1,
        root_id: 1,
        package_id: None,
        file_id: 1,
        rel_path,
        source,
        abs_path: Some(abs_path.to_path_buf()),
        workspace_root: Some(workspace_root.to_path_buf()),
        workspace_roots,
        package_roots,
    }
}

#[test]
fn module_resolver_resolves_relative_specifiers_with_extension_probe() {
    let root = TestRoot::new("relative");
    let app = root.path.join("src/app.ts");
    write_file(&app, "import { helper } from './util';");
    write_file(&root.path.join("src/util.ts"), "export const helper = 1;");

    let ctx = ctx_for(
        "import { helper } from './util';",
        "src/app.ts",
        &app,
        &root.path,
        vec![root.path.clone()],
        Vec::new(),
    );
    let resolver = ModuleResolver::from_extraction_context(&ctx);
    let result = resolver.resolve("./util");

    assert_eq!(result.status, ModuleResolutionStatus::Resolved);
    assert_eq!(result.reason, ModuleResolutionReason::RelativePathResolved);
    assert_eq!(result.resolution_kind, Some(ModuleResolutionKind::Relative));
    assert_eq!(
        result.resolved_abs_path,
        Some(
            fs::canonicalize(root.path.join("src/util.ts"))
                .expect("resolved fixture should canonicalize")
        )
    );
}

#[test]
fn module_resolver_uses_index_fallback() {
    let root = TestRoot::new("index");
    let app = root.path.join("src/app.ts");
    write_file(&app, "import { Button } from './components';");
    write_file(
        &root.path.join("src/components/index.tsx"),
        "export const Button = () => null;",
    );

    let ctx = ctx_for(
        "import { Button } from './components';",
        "src/app.ts",
        &app,
        &root.path,
        vec![root.path.clone()],
        Vec::new(),
    );
    let result = ModuleResolver::from_extraction_context(&ctx).resolve("./components");

    assert_eq!(result.status, ModuleResolutionStatus::Resolved);
    assert_eq!(result.reason, ModuleResolutionReason::IndexFallbackResolved);
    assert_eq!(
        result.resolved_abs_path,
        Some(
            fs::canonicalize(root.path.join("src/components/index.tsx"))
                .expect("resolved fixture should canonicalize")
        )
    );
}

#[test]
fn module_resolver_resolves_tsconfig_alias_path() {
    let root = TestRoot::new("alias");
    let app = root.path.join("src/app.ts");
    write_file(&app, "import { thing } from '@app/lib/thing';");
    write_file(
        &root.path.join("src/lib/thing.ts"),
        "export const thing = 1;",
    );
    write_file(
        &root.path.join("tsconfig.json"),
        r##"{
          "compilerOptions": {
            "baseUrl": ".",
            "paths": {
              "@app/*": ["src/*"]
            }
          }
        }"##,
    );

    let ctx = ctx_for(
        "import { thing } from '@app/lib/thing';",
        "src/app.ts",
        &app,
        &root.path,
        vec![root.path.clone()],
        Vec::new(),
    );
    let result = ModuleResolver::from_extraction_context(&ctx).resolve("@app/lib/thing");

    assert_eq!(result.status, ModuleResolutionStatus::Resolved);
    assert_eq!(result.reason, ModuleResolutionReason::AliasPathResolved);
    assert_eq!(result.resolution_kind, Some(ModuleResolutionKind::Alias));
    assert!(result.config_path.is_some());
}

#[test]
fn module_resolver_reports_ambiguous_multi_root_workspace_packages() {
    let root = TestRoot::new("ambiguous");
    let app_root = root.path.join("app");
    let pkg_a = root.path.join("packages/a");
    let pkg_b = root.path.join("packages/b");
    let app = app_root.join("src/app.ts");
    write_file(&app, "import { value } from '@scope/shared';");
    for pkg in [&pkg_a, &pkg_b] {
        write_file(
            &pkg.join("package.json"),
            r#"{"name":"@scope/shared","exports":"./src/index"}"#,
        );
        write_file(&pkg.join("src/index.ts"), "export const value = 1;");
    }

    let ctx = ctx_for(
        "import { value } from '@scope/shared';",
        "src/app.ts",
        &app,
        &app_root,
        vec![app_root.clone(), pkg_a.clone(), pkg_b.clone()],
        vec![pkg_a, pkg_b],
    );
    let result = ModuleResolver::from_extraction_context(&ctx).resolve("@scope/shared");

    assert_eq!(result.status, ModuleResolutionStatus::Ambiguous);
    assert_eq!(result.reason, ModuleResolutionReason::CrossRootAmbiguous);
    assert_eq!(result.candidates.len(), 2);
}

#[test]
fn module_resolver_marks_relative_escape_as_unsafe() {
    let root = TestRoot::new("unsafe");
    let allowed = root.path.join("allowed");
    let app = allowed.join("src/app.ts");
    write_file(&app, "import secret from '../../outside/secret';");
    write_file(&root.path.join("outside/secret.ts"), "export default 1;");

    let ctx = ctx_for(
        "import secret from '../../outside/secret';",
        "src/app.ts",
        &app,
        &allowed,
        vec![allowed.clone()],
        Vec::new(),
    );
    let result = ModuleResolver::from_extraction_context(&ctx).resolve("../../outside/secret");

    assert_eq!(result.status, ModuleResolutionStatus::Unsafe);
    assert_eq!(result.reason, ModuleResolutionReason::OutsideAllowedRoots);
}

#[test]
fn module_resolver_classifies_unknown_bare_packages_as_external() {
    let root = TestRoot::new("external");
    let app = root.path.join("src/app.ts");
    write_file(&app, "import React from 'react';");

    let ctx = ctx_for(
        "import React from 'react';",
        "src/app.ts",
        &app,
        &root.path,
        vec![root.path.clone()],
        Vec::new(),
    );
    let result = ModuleResolver::from_extraction_context(&ctx).resolve("react");

    assert_eq!(result.status, ModuleResolutionStatus::External);
    assert_eq!(result.reason, ModuleResolutionReason::ExternalPackage);
}

#[test]
fn module_resolver_strips_json_comments_and_trailing_commas_through_extends() {
    let root = TestRoot::new("jsonc");
    let app_root = root.path.join("app");
    let app = app_root.join("src/app.ts");
    write_file(&app, "import { value } from '#pkg/index';");
    write_file(
        &root.path.join("packages/pkg/src/index.ts"),
        "export const value = 1;",
    );
    write_file(
        &root.path.join("tsconfig.base.json"),
        r##"{
          // inherited aliases
          "compilerOptions": {
            "baseUrl": ".",
            "paths": {
              "#pkg/*": ["packages/pkg/src/*",],
            },
          },
        }"##,
    );
    write_file(
        &app_root.join("tsconfig.json"),
        r##"{
          /* child config keeps parent paths */
          "extends": "../tsconfig.base.json",
        }"##,
    );

    let ctx = ctx_for(
        "import { value } from '#pkg/index';",
        "src/app.ts",
        &app,
        &app_root,
        vec![app_root.clone(), root.path.join("packages/pkg")],
        vec![root.path.join("packages/pkg")],
    );
    let result = ModuleResolver::from_extraction_context(&ctx).resolve("#pkg/index");

    assert_eq!(result.status, ModuleResolutionStatus::Resolved);
    assert_eq!(result.reason, ModuleResolutionReason::CrossRootResolved);
    assert_eq!(result.resolution_kind, Some(ModuleResolutionKind::Alias));
    assert_eq!(
        result.resolved_abs_path,
        Some(
            fs::canonicalize(root.path.join("packages/pkg/src/index.ts"))
                .expect("resolved fixture should canonicalize")
        )
    );
}
