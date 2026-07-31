SHELL := /bin/bash

BACKEND  := backend
FRONTEND := frontend

.DEFAULT_GOAL := help
.PHONY: help dev test test-backend test-frontend coverage lint lint-backend lint-frontend \
        docker-up docker-down

help: ## List the available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk -F':.*?## ' '{ printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 }'

dev: ## Run the API on :8080 and the frontend on :5173
	@trap 'kill 0' EXIT INT TERM; \
	 ( cd $(BACKEND)  && go run ./cmd/api ) & \
	 ( cd $(FRONTEND) && npm run dev     ) & \
	 wait

test: test-backend test-frontend ## Run both test suites

test-backend: ## Run the Go tests
	cd $(BACKEND) && go test ./...

test-frontend: ## Run the Vitest suite once
	cd $(FRONTEND) && npm test -- --run

# The gate lives in the script, not here: it needs to parse the coverage profile
# and fail on a threshold, which is more than a recipe line should carry.
# Frontend coverage joins this target in Phase 4, when there is a suite to measure.
coverage: ## Regenerate docs/coverage/ and enforce the Section 6 thresholds
	./scripts/coverage.sh

lint: lint-backend lint-frontend ## Run every static check

# gofmt reports by printing filenames and still exits 0, so the exit code has to
# be derived from its output or a misformatted file passes the build silently.
lint-backend: ## gofmt + go vet
	@cd $(BACKEND) && unformatted=$$(gofmt -l .); \
	 if [ -n "$$unformatted" ]; then \
	   echo "gofmt: not formatted:"; echo "$$unformatted"; exit 1; \
	 fi
	cd $(BACKEND) && go vet ./...

lint-frontend: ## oxlint (jsx-a11y, react) + tsc --noEmit
	cd $(FRONTEND) && npm run lint
	cd $(FRONTEND) && npx tsc --noEmit

docker-up: ## Build and start both services
	docker compose up --build

docker-down: ## Stop both services and remove the volumes
	docker compose down --volumes
