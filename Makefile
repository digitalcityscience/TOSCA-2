# TOSCA web app. `make help` lists the commands.
# Day-to-day development uses npm (see the README); this file holds the two
# commands that are the same in every TOSCA component repository.

SHELL := /bin/bash
.DEFAULT_GOAL := help

IMAGE ?= tosca-frontend:dev

.PHONY: help image release
help: ## Show this list
	@awk 'BEGIN{FS=":.*## "} /^[a-z-]+:.*## /{printf "  make %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

image: ## Build the image as CI does (IMAGE=name:tag, default tosca-frontend:dev)
	DOCKER_BUILDKIT=1 docker build \
	  --build-arg VERSION=local-$$(git rev-parse --short HEAD) \
	  --build-arg REVISION=$$(git rev-parse HEAD)$$([ -z "$$(git status --porcelain)" ] || echo -dirty) \
	  -t $(IMAGE) .
	@echo "Built $(IMAGE). Check it with: scripts/ci/smoke-image.sh $(IMAGE)"

release: ## Tag main as vVERSION and push the tag (VERSION=X.Y.Z); CI publishes the image
	@scripts/release.sh "$(VERSION)"
