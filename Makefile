APP_NAME=dh
GO_CORE_DIR=packages/opencode-core
DIST_DIR=dist
RELEASE_DIR=$(DIST_DIR)/releases
PACKAGE_SCRIPT=scripts/package-release.sh
VERSION ?= dev

.PHONY: check test build go-build release-dirs release-macos-arm64 release-macos-amd64 release-linux-amd64 release-linux-arm64 package-release release-all

check:
	npm run check

test:
	npm test

go-build:
	$(MAKE) -C $(GO_CORE_DIR) build VERSION=$(VERSION)

build: check test go-build

release-dirs:
	mkdir -p $(DIST_DIR)/releases

package-release:
	sh $(PACKAGE_SCRIPT) $(GO_CORE_DIR)/dist/releases $(RELEASE_DIR) $(VERSION)

release-all: check test
	$(MAKE) -C $(GO_CORE_DIR) release-macos-arm64 VERSION=$(VERSION)
	$(MAKE) -C $(GO_CORE_DIR) release-macos-amd64 VERSION=$(VERSION)
	$(MAKE) -C $(GO_CORE_DIR) release-linux-amd64 VERSION=$(VERSION)
	$(MAKE) -C $(GO_CORE_DIR) release-linux-arm64 VERSION=$(VERSION)
	$(MAKE) package-release VERSION=$(VERSION)
