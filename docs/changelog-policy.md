# Changelog And Version Policy

## Version policy

`dh` nên dùng semantic versioning:

- `MAJOR`: breaking CLI/runtime/install behavior
- `MINOR`: feature mới backward-compatible
- `PATCH`: bug fix, docs fix, packaging fix

## Mỗi release nên có gì

- version tag dạng `vX.Y.Z`
- GitHub Release
- binaries cho macOS/Linux
- `SHA256SUMS`
- `manifest.json`
- release notes có install + first-run steps

## Release notes tối thiểu

1. install/upgrade instructions
2. supported platforms
3. main user-facing changes
4. any breaking changes
5. first-run reminder: `dh doctor`, `dh index`
