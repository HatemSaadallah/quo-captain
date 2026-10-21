# Somec quotation cost-analysis generator — one-stop commands.
#   make all      install + database + catalog + build + tests + API demo
#   make dev      run backend (:3000) and frontend (:5173) together
#   make demo     end-to-end API run: project -> cart -> generate -> report
#
# Prerequisites: Node 22, PostgreSQL running locally (brew services start postgresql@18),
# the six Somec workbooks in data/input/, and (optional) Microsoft Excel for recalculation.

SHELL := /bin/bash
.DEFAULT_GOAL := help

DB_NAME ?= somec_quotation
DB_USER ?= $(shell whoami)
DATABASE_URL ?= postgresql://$(DB_USER)@localhost:5432/$(DB_NAME)?schema=public
API ?= http://localhost:3000/api
BACKEND := backend
FRONTEND := frontend

.PHONY: help all install db extract build test backend frontend dev demo excel-status clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

all: install db extract build test demo ## Everything, in order

install: ## npm install for backend and frontend
	cd $(BACKEND) && npm install
	cd $(FRONTEND) && npm install

$(BACKEND)/.env:
	@echo 'DATABASE_URL="$(DATABASE_URL)"' > $(BACKEND)/.env
	@echo 'PORT=3000' >> $(BACKEND)/.env
	@echo "wrote $(BACKEND)/.env"

db: $(BACKEND)/.env ## Create the Postgres database and sync the Prisma schema
	@psql -lqt | cut -d'|' -f1 | grep -qw "$(DB_NAME)" || createdb "$(DB_NAME)"
	cd $(BACKEND) && npx prisma generate && npx prisma db push

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

dev: ## Run backend and frontend together (Ctrl-C stops both)
	@trap 'kill 0' INT TERM EXIT; \
	(cd $(BACKEND) && npm run start:dev) & \
	(cd $(FRONTEND) && npm run dev) & \
	wait

excel-status: ## Ask the running API whether Excel recalculation is available
	@curl -s "$(API)/generation/excel-status?refresh=1"; echo

demo: ## Start the API, run project -> cart -> generate through the HTTP API, print the report
	@test -f $(BACKEND)/dist/main.js || (cd $(BACKEND) && npm run build)
	@test -f data/processed/product_catalog.json || $(MAKE) extract
	@echo "starting API..."; (cd $(BACKEND) && node dist/main.js > /tmp/somec-demo-api.log 2>&1 & echo $$! > /tmp/somec-demo-api.pid)
	@curl -s --retry 40 --retry-connrefused --retry-delay 1 "$(API)/catalog/facets" -o /dev/null || { cat /tmp/somec-demo-api.log; exit 1; }
	@node scripts/demo.js "$(API)"; status=$$?; kill $$(cat /tmp/somec-demo-api.pid) 2>/dev/null; exit $$status

clean: ## Remove build outputs (keeps data/, node_modules and the database)
	rm -rf $(BACKEND)/dist $(FRONTEND)/dist
