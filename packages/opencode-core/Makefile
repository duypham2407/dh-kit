APP_NAME=dh
DIST_DIR=dist

.PHONY: build release-macos-arm64 release-macos-amd64 release-linux-amd64 release-linux-arm64 release-all
build:
	mkdir -p $(DIST_DIR)
	go build -o $(DIST_DIR)/$(APP_NAME) ./cmd/dh

release-macos-arm64:
	mkdir -p $(DIST_DIR)/releases
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-darwin-arm64 ./cmd/dh

release-macos-amd64:
	mkdir -p $(DIST_DIR)/releases
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-darwin-amd64 ./cmd/dh

release-linux-amd64:
	mkdir -p $(DIST_DIR)/releases
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-linux-amd64 ./cmd/dh

release-linux-arm64:
	mkdir -p $(DIST_DIR)/releases
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o $(DIST_DIR)/releases/$(APP_NAME)-linux-arm64 ./cmd/dh

release-all: release-macos-arm64 release-macos-amd64 release-linux-amd64 release-linux-arm64
