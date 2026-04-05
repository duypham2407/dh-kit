APP_NAME=dh
GO_CORE_DIR=packages/opencode-core
DIST_DIR=dist
RELEASE_DIR=$(DIST_DIR)/releases
PACKAGE_SCRIPT=scripts/package-release.sh

.PHONY: check test build go-build release-dirs release-macos-arm64 release-macos-amd64 release-linux-amd64 release-linux-arm64 package-release release-all

check:
	npm run check

test:
	npm test

go-build:
	$(MAKE) -C $(GO_CORE_DIR) build

build: check test go-build

release-dirs:
	mkdir -p $(DIST_DIR)/releases

release-macos-arm64: release-dirs
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-darwin-arm64 ./cmd/dh

release-macos-amd64: release-dirs
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-darwin-amd64 ./cmd/dh

release-linux-amd64: release-dirs
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-linux-amd64 ./cmd/dh

release-linux-arm64: release-dirs
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-linux-arm64 ./cmd/dh

package-release:
	sh $(PACKAGE_SCRIPT) $(GO_CORE_DIR)/dist/releases $(RELEASE_DIR)

release-all: check test
	$(MAKE) -C $(GO_CORE_DIR) release-macos-arm64
	$(MAKE) -C $(GO_CORE_DIR) release-macos-amd64
	$(MAKE) -C $(GO_CORE_DIR) release-linux-amd64
	$(MAKE) -C $(GO_CORE_DIR) release-linux-arm64
	$(MAKE) package-release
