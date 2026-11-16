# Quo-Captain

**Turn years of Excel cost analyses into a searchable catalog, and build new quotations from them in minutes.**

Quo-Captain reads a marine-outfitting estimator's historical *Analisi* workbooks (one product cost analysis per sheet), indexes every analysis with semantic search, and lets an estimator assemble a new quotation from those analyses: adjust quantities and technical parameters, recompute unit costs with an in-app formula engine, benchmark against history, and export a formula-preserving `.xlsx` or a PDF. It was built during a hackathon with a cruise-ship outfitting company's estimating team and runs entirely on your own machine.

All costs shown are **estimated costs** read from the workbooks. Selling prices and margins live in a separate commercial file that is not part of this project.

[![CI](https://github.com/HatemSaadallah/quo-captain/actions/workflows/ci.yml/badge.svg)](https://github.com/HatemSaadallah/quo-captain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **Catalog from Excel.** `npm run extract` reads the workbooks, verifies the cell map, and produces a catalog of analyses with provenance (workbook, sheet, row, item code), parameters, cost breakdown and warnings. Nothing is fabricated: items without a sheet are reported, not guessed.
- **Hybrid search.** Local multilingual embeddings (transformers.js, no API key) plus lexical and dimension matching (`2560x1600` finds the balcony). Similar-analysis suggestions for every record.
- **Quotations and projects.** Projects belong to customers and hold quotations, contacts, briefs and saved assistant conversations. Cart lines are either catalog analyses or free rows typed from the customer's bill of quantities, with suggestions to attach a reference analysis.
- **Cost engine without Excel.** A TypeScript evaluator for the Excel subset the sheets use (IF, VLOOKUP, SUMIF, INDIRECT, CELL, ROUND, …) recomputes each analysis for the new quantity and dimensions. At extraction, 508 of 538 checkable sheets reproduce Excel's cached unit cost to the cent.
- **Web workbook, Excel and PDF.** The ELENCO COSTI cost list is computed live in the browser with the sheet's own formulas, editable yellow input cells and a formula bar. Export a recalculating `.xlsx` built from a template workbook (with a validation report), or a landscape PDF.
- **Import.** Drop an existing *Analisi* workbook to turn it into a draft quotation, with every line matched against the catalog and flagged for review when needed.
- **Benchmarks, dashboard and materials.** Historical min/median/max per row, per-category cost comparison, a dashboard over all quotations, and raw-material market history from public BLS producer-price indexes.
- **3D product preview.** A lazy three.js viewer with ship-overview and installed-detail views for the main product families.
- **Assistant and insights.** Optional LLM features (project search, insights, shareable answer links) through OpenAI, Groq or xAI. Without a key the UI says so explicitly and falls back to deterministic matching.

## Stack

| Part | Tech |
|---|---|
| Backend | NestJS 11, strict TypeScript, Prisma 6 on PostgreSQL, JWT auth |
| Excel engine | Own OOXML reader/editor over the zip parts (`backend/src/common/utils/xlsx-*.ts`), own formula engine (`formula-engine.ts`), optional Excel recalculation through AppleScript on macOS |
| Search | transformers.js (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, downloaded once to `data/models`) + lexical ranking |
| Frontend | React 19, Vite, TypeScript, three.js; types shared with the backend |
| Tests | Vitest. Backend specs run against the real workbooks; frontend specs run against mocked data |

## Quick start

Prerequisites: Node 22 (see `.nvmrc`), npm 10, PostgreSQL running locally. The historical workbooks are private and not included; put them in `data/input/` as `<offer> Analisi.xlsx` (see [docs/excel_structure.md](docs/excel_structure.md) for the structure the extractor expects).

```bash
# backend
cd backend
cp .env.example .env            # set DATABASE_URL and a random JWT_SECRET
npm install
createdb somec_quotation        # or point DATABASE_URL at an existing database
npx prisma generate && npx prisma db push
npm run extract                 # catalog + embeddings; first run downloads the model (~120 MB)
npx prisma db seed              # demo users, sample quotations, materials
npm run start:dev               # http://localhost:3000/api

# frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173, proxies /api to :3000
```

Or run everything with `make all` (install, database and seed, extraction, build, tests, API demo). `make help` lists the targets.

Demo logins created by the seed (fictional, `.local` addresses that reach no real inbox):

| User | Password | Role |
|---|---|---|
| `estimator@somec.local` | `somec2026` | salesperson |
| `admin@somec.local` | `somec2026` | admin |

## Configuration

All settings live in `backend/.env` (template in [`backend/.env.example`](backend/.env.example)). Never commit a real `.env`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN_SECONDS` | Token signing key and lifetime (default 12 h) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional LLM provider for the assistant, insights and project search |
| `GROK_API_KEY`, `GROK_MODEL`, `LLM_REASONING` | Optional Groq (`gsk_…`) or xAI (`xai-…`) key; wins over OpenAI when set |
| `RESEND_API_KEY`, `RESEND_FROM` | Optional email sending through Resend |
| `SOMEC_DISABLE_EXCEL` | Set to `1` to skip the Excel recalculation attempt |

## Repository layout

```
backend/src/common/     xlsx reader/editor, A1 helpers, formula engine, shared interfaces
backend/src/excel/      cell map (somec-schema), catalog extractor, generator, validator, sheet evaluator
backend/src/modules/    auth, catalog, quotations, projects, imports, materials, assistant, emails, generation
backend/src/scripts/    extract-catalog, fidelity check, API demo
backend/prisma/         schema, seeds, material fixture
frontend/src/           React app (dashboard, projects, customers, catalog, materials, quotations, insights, import)
docs/                   excel_structure.md, cell_mapping.md, DEMO_SCRIPT.md, INSIGHT_SHARE.md
data/input/             your workbooks (gitignored, never modified; the generator verifies SHA-256)
data/processed/         catalog + embeddings produced by npm run extract (gitignored)
data/output/            generated workbooks and validation reports (gitignored)
```

## How it works

**Workbook model.** Every *Analisi* workbook is row-aligned: the analysis sheet for the item in row *N* of ELENCO COSTI is named `N`, and row *N* of every aggregation sheet (costi parz., costi tot., quantità, MDO) belongs to it. Sheets identify themselves through `CELL("FILENAME")` and `INDIRECT`, so a copied sheet binds itself to its new row. The verified cell map is in [docs/cell_mapping.md](docs/cell_mapping.md).

**Extraction.** The catalog extractor opens each workbook with the OOXML reader (formulas and cached values are read separately, shared formulas are expanded, cached errors surface as errors), reads the ELENCO COSTI rows and their sheets, and stores each tab's logic (every input and formula cell) plus the sheets it reads (price list, budget, indirect costs). Records go to `data/processed/product_catalog.json` and are synced into PostgreSQL.

**Costing.** For a quotation row with a stored tab, the sheet evaluator runs the tab's formulas with the row's quantity, dimensions and parameter overrides against the tab's own price list, so fixed engineering costs spread over the new quantity and material quantities follow the new dimensions. Rows without a tab show no cost (never 0) and count as incomplete.

**Generation.** The generator copies the template workbook, writes the project header, ELENCO COSTI and BOQ rows, copies each analysis sheet under its new row number, writes the row-401 `INDIRECT` template formulas into the aggregation sheets, sets `fullCalcOnLoad`, recalculates with Excel when scriptable, validates and saves `data/output/<ref>_<timestamp>/<ref> Analisi.xlsx` with a `validation_report.json`. Without Excel the output is an honest draft (`status: requires_review`) that recalculates on open.

## API overview

Every route except `POST /api/auth/login` requires `Authorization: Bearer <jwt>`.

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Catalog | `GET /api/catalog/facets`, `GET /api/catalog/search?q=&workbook=&category=&limit=`, `GET /api/catalog/:id`, `GET /api/catalog/:id/similar` |
| Quotations | CRUD on `/api/quotations[/:id]`, items `/api/quotations/:id/items[/:itemId]`, free rows `/rows`, `/items/:itemId/suggestions`, `/items/:itemId/attach`, `/items/:itemId/benchmark` |
| Costing | `GET /api/quotations/:id/elenco-costi`, `GET /api/quotations/:id/elenco-costi.pdf`, `GET /api/quotations/:id/workbook`, `GET /api/quotations/:id/validation` |
| Generation | `POST /api/quotations/:id/generate`, `GET /api/generation/excel-status?refresh=1`, `GET /api/outputs[...]` |
| Projects, customers, dashboard | `/api/projects` (briefs, requirements, messages, proposals, search), `/api/customers`, `/api/dashboard` |
| Materials | `GET /api/materials`, `GET /api/materials/:id/prices?range=6m` |
| Imports, assistant, insights, emails | `/api/imports`, `/api/assistant`, `/api/insights`, `/api/emails` |

## Testing

```bash
cd backend && npm run typecheck && npm run lint && npm test   # specs need the workbooks in data/input
cd frontend && npm run typecheck && npm run lint && npm test
```

CI runs typecheck, lint and build for both packages and the frontend test suite. The backend suite is excluded from CI because it asserts against the private workbooks. A fidelity check (`npx tsx src/scripts/fidelity/fidelity.ts` in `backend`) compares the in-app engine with Excel's cached results for every extracted sheet.

## Limitations

- Automatic Excel recalculation needs macOS with Microsoft Excel and a one-time "grant access" to `data/output`; otherwise outputs are drafts that recalculate on open.
- Cross-workbook copies use the template's price list; missing codes are listed in the report and show as `#N/A`, exactly as a manual copy would.
- Analysis sheets that reference other analysis sheets are copied alone; dangling references are reported. Charts, images and form controls inside analysis sheets are not copied.
- BOQ per-deck counts are not modelled; the quantity is written as one number.
- Material market charts show published US producer-price indexes as broad proxies, not supplier quotes. No daily movement is interpolated or invented.
- Email sending and audio transcription are not included; the email composer opens a draft in your mail app.

## License

[MIT](LICENSE). Product photos in `frontend/public/products/` are Creative Commons; see [CREDITS.md](frontend/public/products/CREDITS.md).
