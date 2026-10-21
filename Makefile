# Somec quotation cost-analysis generator — one-stop commands.
#   make all      install + database (+ seed) + catalog + build + tests + API demo
#   make dev      run backend (:3000) and frontend (:5173) together
#   make demo     end-to-end API run on its own port: login -> search -> cart -> generate -> report
#
# Prerequisites: Node 22, PostgreSQL running locally (brew services start postgresql@18),
# the six Somec workbooks in data/input/, and (optional) Microsoft Excel for recalculation.
# Mock login after `make db`: estimator@somec.local / somec2026

SHELL := /bin/bash
.DEFAULT_GOAL := help
.NOTPARALLEL:

DB_NAME ?= somec_quotation
DB_USER ?= $(shell whoami)
DATABASE_URL ?= postgresql://$(DB_USER)@localhost:5432/$(DB_NAME)?schema=public
DEMO_PORT ?= 3999
BACKEND := backend
FRONTEND := frontend

.PHONY: help all install db extract build test backend frontend dev demo excel-status clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

all: ## Everything, in order (serial)
	$(MAKE) install
	$(MAKE) db
	$(MAKE) extract
	$(MAKE) build
	$(MAKE) test
	$(MAKE) demo

install: ## npm install for backend and frontend
	cd $(BACKEND) && npm install
	cd $(FRONTEND) && npm install

$(BACKEND)/.env:
	@printf 'DATABASE_URL="%s"\nPORT=3000\nJWT_SECRET="%s"\n' '$(DATABASE_URL)' "$$(openssl rand -hex 24)" > $(BACKEND)/.env
	@echo "wrote $(BACKEND)/.env"

db: $(BACKEND)/.env ## Create the Postgres database, sync the Prisma schema, seed the mock user + sample quotation (when a seed is configured)
	@psql -lqt | cut -d'|' -f1 | grep -qw "$(DB_NAME)" || createdb "$(DB_NAME)"
	cd $(BACKEND) && npx prisma generate && npx prisma db push
	@cd $(BACKEND) && if node -e "process.exit(require('./package.json').prisma && require('./package.json').prisma.seed ? 0 : 1)"; then npx prisma db seed; else echo "no seed configured"; fi

extract: ## Index data/input/*.xlsx into data/processed (catalog + embeddings)
	@ls data/input/*.xlsx >/dev/null 2>&1 || { echo "Put the Somec workbooks in data/input/ first"; exit 1; }
	cd $(BACKEND) && npm run extract

build: ## Compile backend (tsc) and frontend (vite)
	cd $(BACKEND) && npm run build
	cd $(FRONTEND) && npm run build

test: ## Backend test suite against the real workbooks
	cd $(BACKEND) && npm test

backend: ## Run the API in watch mode on :3000
	cd $(BACKEND) && npm run start:dev

frontend: ## Run the Vite dev server on :5173 (proxies /api to :3000)
	cd $(FRONTEND) && npm run dev

dev: ## Run backend and frontend together (Ctrl-C stops exactly these two processes)
	@set -m; \
	(cd $(BACKEND) && exec npm run start:dev) & B=$$!; \
	(cd $(FRONTEND) && exec npm run dev) & F=$$!; \
	trap 'kill $$B $$F 2>/dev/null; wait $$B $$F 2>/dev/null || true' INT TERM EXIT; \
	wait $$B $$F

excel-status: ## Ask the API on :3000 whether Excel recalculation is available
	@curl -s "http://localhost:3000/api/generation/excel-status?refresh=1"; echo

demo: ## Start a private API on $(DEMO_PORT), run login -> search -> cart -> generate, print the report, stop it
	@test -f $(BACKEND)/dist/main.js || (cd $(BACKEND) && npm run build)
	@test -f data/processed/product_catalog.json || $(MAKE) extract
	@set -e; \
	if lsof -iTCP:$(DEMO_PORT) -sTCP:LISTEN >/dev/null 2>&1; then echo "port $(DEMO_PORT) is busy; set DEMO_PORT=<free port>"; exit 1; fi; \
	LOG=$$(mktemp -t somec-demo); \
	(cd $(BACKEND) && PORT=$(DEMO_PORT) exec node dist/main.js > "$$LOG" 2>&1) & PID=$$!; \
	trap 'kill $$PID 2>/dev/null; wait $$PID 2>/dev/null || true' INT TERM EXIT; \
	echo "API pid $$PID on :$(DEMO_PORT), log $$LOG"; \
	for i in $$(seq 1 60); do \
	  kill -0 $$PID 2>/dev/null || { echo "API exited early:"; cat "$$LOG"; exit 1; }; \
	  curl -sf "http://localhost:$(DEMO_PORT)/api/catalog/facets" -H "authorization: Bearer x" -o /dev/null -w '' 2>/dev/null && break; \
	  curl -s "http://localhost:$(DEMO_PORT)/api/catalog/facets" -o /dev/null -w '%{http_code}' 2>/dev/null | grep -q 401 && break; \
	  sleep 1; \
	done; \
	cd $(BACKEND) && npx tsx src/scripts/demo/demo.ts "http://localhost:$(DEMO_PORT)/api"

clean: ## Remove build outputs (keeps data/, node_modules and the database)
	rm -rf $(BACKEND)/dist $(FRONTEND)/dist
