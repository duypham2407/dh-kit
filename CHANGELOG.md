# Changelog

All notable changes to `dh` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

<!-- NEW_RELEASE_ENTRY -->

## [0.3.1-rc.6](https://github.com/duypham2407/dh-kit/releases/tag/v0.3.1-rc.6) — 2026-05-10

### Features

- add binary JSON-RPC bridge negotiation ([3ed61ba](https://github.com/duypham2407/dh-kit/commit/3ed61ba68db4c100f8fc7cd335d29af66b9673f4))
- add fallback to openai-compatible SDK when provider or model is not found in registry ([20d8d7f](https://github.com/duypham2407/dh-kit/commit/20d8d7f4e25d2c7041bdd044205387e9f8072454))
- add local vector DB retrieval backend ([2c972d6](https://github.com/duypham2407/dh-kit/commit/2c972d6c2177dc304791482937d52579ca8cb0a3))
- add provider configuration schema and factory for dynamic AI model initialization ([35b1f88](https://github.com/duypham2407/dh-kit/commit/35b1f8814b3718d8ea207ae88dd83b37f417ac8c))
- add session.runLane protocol and implement runtime.ping status reporting ([f8dfe4b](https://github.com/duypham2407/dh-kit/commit/f8dfe4bd546be47de2ac359877cb7e11558229ef))
- expand CLI query support and doctor visibility, update Quick Agent prompt and parser, and adjust benchmark improvement thresholds ([509d9a9](https://github.com/duypham2407/dh-kit/commit/509d9a9e31a3a6799f56cd5b27f36759e1887c2b))
- implement core graph schema models and add architectural documentation for release validation. ([c37b109](https://github.com/duypham2407/dh-kit/commit/c37b109888b81dd22db67d2747a4ff11009d26c5))
- implement hybrid evidence ranking and batch embedding support with configurable provider base URLs ([99800d4](https://github.com/duypham2407/dh-kit/commit/99800d4070e04d0eaf051309b8903004935d63bf))
- implement session management CLI and introduce workflow lanes to core engine logic ([fe7d832](https://github.com/duypham2407/dh-kit/commit/fe7d832534266669cff2ff5dc3caddc02556c4ef))
- implement session management engine and state machine for workflow lifecycle tracking ([fda70de](https://github.com/duypham2407/dh-kit/commit/fda70de2d1311b7b5f28c0bbaedaafff9ded0103))
- implement worker heartbeat monitoring and make JSON-RPC IDs optional ([8a5ced7](https://github.com/duypham2407/dh-kit/commit/8a5ced77617428cfe1fdeb7381e3069f0e7ac12b))
- integrate semantic search, entry point analysis, and enhanced evidence gathering capabilities across the query engine. ([015e6c9](https://github.com/duypham2407/dh-kit/commit/015e6c9910e66bf76fec8b7097ec1a1f3e830b5c))
- migrate graph extraction to Rust ([d27ab82](https://github.com/duypham2407/dh-kit/commit/d27ab8280c4fff3316e4e19356f62c16de7433fe))

### Bug Fixes

- restore dh release startup path ([9b7680a](https://github.com/duypham2407/dh-kit/commit/9b7680a5b0828c41416f3455e9e86d0feca6fcb1))
- stabilize release packaging test on linux ([0a2156f](https://github.com/duypham2407/dh-kit/commit/0a2156fb80c91eb2873f6dfc2bb82d6732523e1c))
- stabilize recovered worker fixture for ci ([1400444](https://github.com/duypham2407/dh-kit/commit/140044410953bae69152776793cb5311917a57ec))

### Documentation

- add migration plan and feature improvement documentation for the Rust engine transition ([90264bd](https://github.com/duypham2407/dh-kit/commit/90264bdcc67947fbe7c93f93f76c72ba0f933308))
- rewrite README — concise English-only intro, setup, and usage ([cc451a1](https://github.com/duypham2407/dh-kit/commit/cc451a1eb9da821d1bfd1e98fb6c2d9766a298fc))

### Chores

- bump version to 0.2.0 for Rust-engine release ([2403568](https://github.com/duypham2407/dh-kit/commit/2403568b4a01b22bfc1e21bb26d8ce81754480a8))
- replace registry-based provider system with a new Copilot-compatible SDK and standardized mock utilities ([54ab32c](https://github.com/duypham2407/dh-kit/commit/54ab32cf5a0386837954a2b797f1c278b0097f45))

---

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
