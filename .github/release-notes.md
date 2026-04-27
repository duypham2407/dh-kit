## Install

### One-line install for macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/install-github-release.sh | sh
```

### Install from release directory

```sh
scripts/install-from-release.sh dist/releases
```

## First Run

```sh
cd /path/to/your-project
dh --help
dh status
dh index
dh ask "how does this project work?"
```

## Included Artifacts

Supported release targets are Linux and macOS. Windows is not a current target
platform for release artifacts or installer support.

- macOS Apple Silicon: `dh-darwin-arm64`
- macOS Intel: `dh-darwin-amd64`
- Linux x86_64: `dh-linux-amd64`
- Linux ARM64: `dh-linux-arm64`

Checksums are included in `SHA256SUMS`.
