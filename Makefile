APP_NAME=dh
RUST_ENGINE_DIR=rust-engine
DIST_DIR=dist
RELEASE_DIR=$(DIST_DIR)/releases
PACKAGE_SCRIPT=scripts/package-release.sh
RUST_RELEASE_STAGE_DIR=$(DIST_DIR)/rust-engine/releases
VERSION ?= dev

.PHONY: check test rust-test rust-build-release build package-release release-all

check:
	npm run check

test:
	npm test

rust-test:
	cargo test --workspace --manifest-path $(RUST_ENGINE_DIR)/Cargo.toml

rust-build-release:
	mkdir -p $(RUST_RELEASE_STAGE_DIR)
	@platform=$$(uname -s | tr '[:upper:]' '[:lower:]'); \
	arch=$$(uname -m); \
	case "$$arch" in \
		aarch64) arch="arm64" ;; \
		x86_64) arch="amd64" ;; \
	esac; \
	cargo build --release -p dh-engine --manifest-path $(RUST_ENGINE_DIR)/Cargo.toml; \
	cp "$(RUST_ENGINE_DIR)/target/release/dh-engine" "$(RUST_RELEASE_STAGE_DIR)/$(APP_NAME)-$$platform-$$arch"; \
	chmod +x "$(RUST_RELEASE_STAGE_DIR)/$(APP_NAME)-$$platform-$$arch"

build: check test rust-test rust-build-release

release-dirs:
	mkdir -p $(DIST_DIR)/releases

package-release:
	sh $(PACKAGE_SCRIPT) $(RUST_RELEASE_STAGE_DIR) $(RELEASE_DIR) $(VERSION)

release-all: check test rust-test rust-build-release
	$(MAKE) package-release VERSION=$(VERSION)
