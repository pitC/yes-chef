.PHONY: help deploy deploy-public deploy-hosting deploy-server deploy-all build-server check-gcloud

PROJECT ?= yes-chef-cookbook
REGION  ?= europe-west1
SERVICE ?= yes-chef-cookbook

help:
	@echo "Targets:"
	@echo "  make deploy          - deploy hosting only (alias for deploy-public)"
	@echo "  make deploy-public   - firebase deploy --only hosting"
	@echo "  make deploy-server   - gcloud run deploy --source . (Cloud Run: $(SERVICE) in $(REGION))"
	@echo "  make deploy-all      - hosting + server"
	@echo "  make build-server    - typecheck + build server (server/tsc)"
	@echo "Variables: PROJECT=$(PROJECT) REGION=$(REGION) SERVICE=$(SERVICE)"
	@echo "  Override: make deploy-server PROJECT=my-proj REGION=europe-west1 SERVICE=my-svc"

deploy: deploy-public

deploy-public deploy-hosting:
	firebase deploy --only hosting --project $(PROJECT)

deploy-all: deploy-public deploy-server

# Verify gcloud is installed and project is reachable before deploying.
check-gcloud:
	@command -v gcloud >/dev/null 2>&1 || { echo "error: gcloud not found. Install: https://cloud.google.com/sdk/docs/install" >&2; exit 1; }
	@gcloud config get-value project >/dev/null 2>&1 || true

build-server:
	npm --prefix server run typecheck
	npm --prefix server run build

# Deploy server to Cloud Run from repo root.
# Uses root Dockerfile (delegates to server/Dockerfile) via --source .
# Preserves existing env vars (FIREBASE_PROJECT_ID etc. managed by Terraform).
# For first-time deploy with custom env: gcloud run deploy ... --set-env-vars=KEY=VAL
deploy-server: check-gcloud
	@echo "→ Deploying $(SERVICE) to $(REGION) (project $(PROJECT)) from . via Cloud Build..."
	gcloud run deploy $(SERVICE) \
		--source . \
		--region=$(REGION) \
		--project=$(PROJECT) \
		--allow-unauthenticated \
		--port=8080
	@echo "→ Done. URL: $$(gcloud run services describe $(SERVICE) --region=$(REGION) --project=$(PROJECT) --format='value(status.url)')"
	@echo "  Health: $$(gcloud run services describe $(SERVICE) --region=$(REGION) --project=$(PROJECT) --format='value(status.url)')/health"
	@echo "  MCP:    $$(gcloud run services describe $(SERVICE) --region=$(REGION) --project=$(PROJECT) --format='value(status.url)')/mcp"
