# Changelog

All notable changes to `dh` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

<!-- NEW_RELEASE_ENTRY -->

## [Unreleased]

### Added

- Deepen the Rust engine with bounded graph, query, trace, impact, and evidence-backed code understanding support.
- Harden the Rust↔TS bridge into a bounded V2 contract with capability advertisement and explicit lifecycle/failure semantics.
- Complete workflow-engine inspectability across roster ownership, lane behavior, approval gates, reroutes, and resumability.
- Polish operator-facing product surfaces across doctor summaries, degraded-mode messaging, lifecycle outputs, and next-step guidance.

### Changed

- Normalize operator-facing output vocabulary across doctor and lifecycle surfaces.
- Improve startup vs request failure truthfulness in bridge-backed flows.
- Clarify authoritative workflow state vs compatibility mirror responsibilities.
- Align install/upgrade/uninstall and release-facing docs with actual shipped behavior.
- Clarify that supported install and release targets are Linux and macOS; Windows is not a current target platform.
- Harden release lifecycle trust reporting with explicit verification tiers: local release-directory path stays strongest (manifest + checksum + file-size), while GitHub/direct-binary paths now declare bounded verification and limitations without parity overclaim.

### Fixed

- Usage/reference responses now include evidence and truthful partial vs grounded states.
- Malformed startup protocol responses are no longer mislabeled as request-phase failures.
- Full code review and QA unavailable-tool paths are now documented, inspectable, and stage-scoped.
- Product-health vs workflow-state boundary wording is clearer and more consistent.

### Validation

- `cargo test --workspace`
- `npm run check`
- `npm test`
- targeted bridge tests
- targeted doctor tests
- release artifact verification
- installer lifecycle tests
- Semgrep quality/security scans

## [0.1.0](https://github.com/duypham2407/dh-kit/releases/tag/v0.1.0) — 2026-04-05

### Other Changes

- Add GitHub release installer and first-run CLI guidance ([dfa2ea1](https://github.com/duypham2407/dh-kit/commit/dfa2ea165d45c7d8294ff764bea4bbd17a06de2e))
- Add first-run onboarding and Homebrew distribution plan ([83dc877](https://github.com/duypham2407/dh-kit/commit/83dc877f418a7668e0303d85a4792f9f0adfd7ff))
- Add post-roadmap hardening: CI pipelines, release signing, installer hardening, session persistence, retrieval quality calibration, doctor monitoring ([65e94f8](https://github.com/duypham2407/dh-kit/commit/65e94f82c55d5f09f8a9ccaf7c6cd7c8e5032f68))
- Add step-by-step user guide to README ([4d1daa8](https://github.com/duypham2407/dh-kit/commit/4d1daa815078edb3f10e1be7c38026b475f2a9cf))
- Clarify README requirements for users and developers ([82953e6](https://github.com/duypham2407/dh-kit/commit/82953e610ab493e2845b88699f53bdf034b4a525))
- Complete post-roadmap hardening: HNSW ANN index, telemetry, DB recovery ([bddb25f](https://github.com/duypham2407/dh-kit/commit/bddb25f24afd4464dec24caffa862f32b1888563))
- Expand README into detailed usage guide ([c528276](https://github.com/duypham2407/dh-kit/commit/c528276b8a4ff5e53f6fe191f59d40180f10f505))
- Fix workflow YAML: remove secrets from if-conditions ([aae6d33](https://github.com/duypham2407/dh-kit/commit/aae6d3372adff878d9288ba66fee582ac3b23e24))
- Improve product UX: version, clean reset, release notes ([568dd1f](https://github.com/duypham2407/dh-kit/commit/568dd1f16daa5288045c29d60256016ba1cd6b41))
- Productize user docs for macOS and Linux ([398510a](https://github.com/duypham2407/dh-kit/commit/398510a6812b536e89dab0877f3191223b882ea0))
- Remove example/ from tracking: contains sensitive credentials ([0fb362c](https://github.com/duypham2407/dh-kit/commit/0fb362c99fc6d44f346e9e3326ad50e33af8c0c5))
- Sanitize PATCHES note about local OpenAI key source ([521c69b](https://github.com/duypham2407/dh-kit/commit/521c69b20ddc994f7392edbff79cb4ddc9ee73b6))
- Sync architecture docs with completed runtime state ([7c472d2](https://github.com/duypham2407/dh-kit/commit/7c472d26b930493da616a74b055ccafa4a498004))
- Update .gitignore: add HNSW cache, OpenCode DB, telemetry logs, DB backups ([955a4ac](https://github.com/duypham2407/dh-kit/commit/955a4ac8a9a590c2dd9166577ebb22b3bebb329d))
- Wire canonical version into Go binary and add Homebrew formula generation ([d8d6303](https://github.com/duypham2407/dh-kit/commit/d8d6303d65a9349609c29ca5c71f359fd67e28a8))

---
