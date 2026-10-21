# Somec quotation cost-analysis generator (MVP)

Turns Somec's historical "Analisi" Excel workbooks into a searchable catalog of product cost analyses, lets an estimator build a cart of analyses (semantic search + similar-product suggestions, editable quantity and technical parameters), and generates a new, formula-preserving `.xlsx` cost-analysis workbook from a template workbook, with a validation report.

Costs everywhere in this tool are **estimated costs** read from the workbooks. Selling prices and margins live in Somec's separate commercial file, which is not part of this project.

## Stack

| Part | Tech |
|---|---|
| Backend | NestJS 11 (CommonJS, strict TypeScript), Prisma 6 on PostgreSQL (users, quotations, cart items, generation history), JWT login |
| Excel engine | Own OOXML reader/editor on the zip parts (`backend/src/common/utils/xlsx-reader.ts`, `xlsx-editor.ts`); Microsoft Excel via AppleScript for recalculation when scriptable (macOS) |
| Search | Local embeddings with transformers.js (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, downloaded once to `data/models`) + lexical/dimension matching, hybrid ranking |
| Frontend | React 19 + Vite + TypeScript, types shared with the backend |
| Tests | Vitest against the real workbooks |

## Repository layout

```
data/input/            the six original workbooks (never modified; generator verifies SHA-256)
data/processed/        product_catalog.json + catalog_embeddings.json (npm run extract)
data/output/<ref>_<ts>/<ref> Analisi.xlsx + validation_report.json
backend/src/common/    utils (xlsx reader/editor, A1 helpers, xml, paths) and shared interfaces
backend/src/excel/     somec-schema (verified cell map), catalog-extractor, generator, validator, excel-automation
backend/src/modules/   catalog (search, embeddings), quotations (cart, Prisma), generation, prisma
backend/src/scripts/   extract-catalog
backend/prisma/        schema.prisma (PostgreSQL)
frontend/src/          App, components/{CatalogPage,QuotationList,QuotationPage,NewQuotation,QuotationForm,ProductSearch,ElencoCosti,WorkbookView,Benchmark,Cart}, route.ts, api.ts
docs/                  excel_structure.md, cell_mapping.md, review exchange with Codex
```

## Prerequisites

* Node 22, npm 10
* PostgreSQL running locally (tested with Homebrew `postgresql@18`, database `somec_quotation`, local trust auth)
* macOS with Microsoft Excel for the recalculation step (optional; without it the output is a draft that Excel recalculates on open)

## Install and run

```bash
# backend
cd backend
npm install                      # .npmrc sets legacy-peer-deps (npm 10 bug with vite peer sets)
createdb somec_quotation         # or edit backend/.env DATABASE_URL
npx prisma generate && npx prisma db push
npm run extract                  # ~15 s catalog + ~20 s embeddings (first run downloads the model, ~120 MB)
npm run start:dev                # http://localhost:3000/api

# frontend (second terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173 (proxies /api to :3000)
```

Tests (real workbooks, ~30 s) and frontend component tests:

```bash
cd backend && npm test
cd frontend && npm test
```

Or everything at once: `make all` (install, database + seed, catalog extraction, build, tests, API demo).

## Login and users

Every API route except `POST /api/auth/login` needs `Authorization: Bearer <jwt>`. Quotations belong to the user who created them. `npx prisma db seed` (also run by `make db`) creates two mock users and a sample quotation for the first one:

| User | Password | Role |
|---|---|---|
| `estimator@somec.local` | `somec2026` | salesperson (owns the seeded quotation `TM2099-00`, 3 cart lines) |
| `admin@somec.local` | `somec2026` | admin |

Passwords are hashed with Node's scrypt; tokens are signed with `JWT_SECRET` from `backend/.env` (12 h by default). `make demo` and the frontend log in with the estimator account.

## Projects, customers and contacts

Each quotation belongs to a project. Projects belong to a customer and can contain multiple quotations and directory contacts. On a database that already contains quotations, apply the nullable backfill schema, seed the project/customer/contact links, then apply the required relation:

```bash
cd backend
npx prisma db push --schema prisma/schema.project-backfill.prisma
npm run db:seed
npx prisma db push
```

The seed step stops if an existing quotation has no customer value that can be repaired from the explicit seed corrections. New quotations require a project.

## Raw materials

The Materials tab uses database records linked to existing catalog products, with quantities per costing unit and original analysis-batch quantities. The normalized fixture in `backend/prisma/data/material-products.json` maps all 568 entries from `somec_products_index.json` to existing product IDs. The index contains product prices, but no raw-material purchase rates: the seed supplies 20 labelled mock rates. Historical component quantities come from existing analysis breakdowns; description-only component quantities are explicitly labelled mock.

Run `npm run db:push` followed by `npm run db:seed-materials` in `backend` to apply the material schema and backfill existing products. The regular database seed also runs this step. Re-seeding preserves manually edited material prices.

## Web ELENCO COSTI and reference tabs

The primary deliverable is the ELENCO COSTI computed in the web (`GET /api/quotations/:id/elenco-costi`, right-hand tab in the UI) with the sheet's own formulas, verified in `docs/cell_mapping.md`:

| Column | Formula (sheet) | In the web |
|---|---|---|
| H m² unit | `IF(AND(D="m",G<>0),G/1000,G*F/1000000)` | same |
| I m² total | `IF(D="m²",E,H*E)` | same |
| J unit cost € | `ROUND('costi parz.'!$BE<row>,1)` | the attached tab's unit cost recomputed by the app engine for this row (`computed`), else its historical value, or a manual override |
| K total € | `J*E` | same |
| TOTAL COST / m² | `SUM(K6:K401)` / `SUM(I6:I400)` | same |
| Summary by position | `SUMIF(A, pos, I\|K)`, unit = K/I | same |

**Cost engine in the app (no Excel at runtime).** `npm run extract` also stores each tab's logic (every input and formula cell, `ReferenceTab.cells`) and the sheets a tab reads (`WorkbookSnapshot`: DATI GEN. price list, BDG Costi, indiretti, ELENCO COSTI, costi parz.). `backend/src/common/utils/formula-engine.ts` evaluates the Excel subset those sheets use (IF, VLOOKUP, IFERROR, SUMIF, SUM, INT, CEILING, INDIRECT, CELL, ROUND, CONCATENATE, OR, MID, FIND, VALUE, TRIM, COUNTIF(S), LEFT/RIGHT, SUMPRODUCT, PRODUCT, FLOOR(.MATH), AND, MAX, TRUNC) and `sheet-evaluator.ts` runs a stored tab with the quotation's quantity, text and parameter overrides. Rows whose tab logic is stored get `unitCostSource: "computed"`: J is recalculated for the row's quantity and parameters (fixed engineering/management costs spread over the new quantity, material quantities from the new dimensions), with the tab's own workbook price list. Fidelity, measured at extraction with each tab's historical inputs (`npx tsx src/scripts/fidelity/fidelity.ts`): 508 of 538 checkable tabs reproduce Excel's cached E67 to the cent (TM1643-06 83/84, TM1823-03 90/91, TM1837-02 54/55, TM2030-00 215/216, TM2086-01 57/80, TM1641-03 9/12; the other TM1641-03 tabs have no cached E67 because Excel never computed them). Tabs marked `off` are flagged in the row; rows without an attached tab show no cost (never 0) and count as incomplete.

**Reference tabs** (the numbered analysis sheets) are extracted into `data/processed/product_catalog.json` and stored in Postgres (`ReferenceTab`, 589 rows) with provenance (workbook, sheet, row, item code), inputs (parameters, codes used, cost breakdown), dependencies, warnings, source cells, the embedding vector (384-d, multilingual MiniLM) and a content fingerprint. `npm run extract` rebuilds and re-syncs them; the API loads them from the database (`facets.source = "database"`), falling back to the JSON index.

A cost row is either a tab added from search, or a **free row** typed from the customer's BOQ (`POST /api/quotations/:id/rows`). `GET .../items/:itemId/suggestions` ranks reference tabs by similarity to the row's description and dimensions; `POST .../items/:itemId/attach {referenceTabId}` attaches one (provenance, parameters and historical unit cost come from the tab; the row keeps its own text unless `overwrite: true`); `DELETE .../attach` detaches. A high similarity score is a suggestion, not proof of technical compatibility: the UI shows the tab's source, specs and cost before attaching.

## Workflow

1. **Quotation setup** – create a quotation (name, customer, reference = offer number such as `TM2099-00`, date, estimator) and pick the template workbook. The template provides the price list (`DATI GEN.`), budget and indirect-cost structure; its own items are emptied in the output.
2. **Find an analysis** – type a description (e.g. `prefabricated balcony 1600x2560`, `glass railing for cabin balcony`); results are ranked by embedding similarity plus text/dimension matching and show the source workbook, sheet, item code, historical quantity and unit cost. Selecting one shows its description, cost breakdown, source cells, extraction notes and **similar analyses**.
3. **Cart** – add the analysis with a new quantity and the permitted technical parameters (the literal input cells of the sheet, e.g. `INTERASSE BALCONY N3`, `PROFONDITA' BALCONY N4`). Edit position, item code, description, unit, quantity, dimensions inline. Validation runs on every change: missing/invalid quantities, missing sheets, incompatible sheets (analysis sheets that reference other analysis sheets copied from another workbook), cross-workbook price-list warnings, duplicate codes.
4. **Generate Excel Analysis** – the backend copies the template, writes DATI GEN., ELENCO COSTI and BOQ rows, copies each analysis sheet under its new row number, writes the workbook's own row-401 `INDIRECT` formulas into `costi parz.`/`quantità`/`MDO`, sets `fullCalcOnLoad`, recalculates with Excel when scriptable, validates and saves `data/output/<ref>_<timestamp>/<ref> Analisi.xlsx` + `validation_report.json`. The UI shows the report and download links.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` · GET `/api/auth/me` | login (public), current user |
| GET | `/api/catalog/facets` | workbooks, categories, embedding status |
| GET | `/api/catalog/search?q=&workbook=&category=&limit=&mode=lexical` | hybrid search (`semantic:false` + `embeddingStatus` while the index warms up) |
| GET | `/api/catalog/:id` · `/api/catalog/:id/similar` | record, nearest neighbours |
| GET/POST/PATCH/DELETE | `/api/quotations[/:id]` | quotations |
| POST/PATCH/DELETE | `/api/quotations/:id/items[/:itemId]` | cart lines (only position, item code, description, unit, notes, quantity, L/H, params are editable; provenance comes from the catalog) |
| GET | `/api/quotations/:id/validation` | issues + indicative total |
| POST | `/api/quotations/:id/generate` | generate + validate |
| GET | `/api/generation/excel-status?refresh=1` | Excel automation availability |
| GET | `/api/outputs` · `/api/outputs/:folder/:file` · `/api/outputs/:folder/report` | list / download |

## What is verified, and what is not

Verified by tests on the real files (`backend/src/**/*.spec.ts`, 46 tests):

* all six workbooks open; formulas and cached values are read separately; shared formulas are expanded; cached errors (`#VALUE!`, `#N/A`) surface as errors;
* catalog: TM1643-06 item `01-01` → sheet `10`, 1 090.70 € (sheet E67 = 1 090.74), 712 pcs, 2560×1600; TM1823-03 `01-01` → 1 110.00 €; TM1641-03 items without sheets and its broken offer number are reported, nothing fabricated; provenance (`sourceCells`) kept;
* search: lexical and semantic queries find the balcony; similar products for it include the TM1823-03 repeat; dimension matching rewards `2560x1600`;
* cart rules: positive quantities, valid reference, missing sheet, incompatible configuration, cross-workbook warning, mm parameters;
* generation: sources unchanged (SHA-256), file named after the reference, template structure/external links kept, `fullCalcOnLoad` set, calc chain dropped, sheets copied under the first free rows with identity formulas intact, parameter override written to `N4` while derived `N5` keeps its formula, DATI GEN. header, ELENCO COSTI/BOQ rows and links, template items emptied, `INDIRECT` template formulas written in `costi parz.`/`quantità`/`MDO`, honest report (`requires_review` when not recalculated), refusal of items without a sheet, flagging of inter-sheet dependencies.

Not verified in this environment:

* **Excel recalculation.** Excel 16 answers AppleScript on this machine, but opening a workbook from the repository folder stops at Excel's sandbox dialog ("grant access" to the folder) that the terminal cannot click: the `open` event times out and the generator produces a **draft** (`status: requires_review`, `recalculation.performed: false`). The output recalculates when you open it in Excel (external-link prompt: choose "don't update"). To enable automatic recalculation once: run a generation (or `make demo`), switch to Excel, click **Grant Access / Allow** on the dialog for `data/output`, and the next generation will recalculate (`GET /api/generation/excel-status?refresh=1` reports availability; `SOMEC_DISABLE_EXCEL=1` disables the attempt). Excel's own `open workbook` command does not work for sandboxed paths, which is why the automation uses the standard `open`.
* Cross-workbook copies get the template's price list: codes that do not exist there are listed in the report (`missingCodes`) and show as `#N/A` after recalculation, exactly as they would if an estimator copied the sheet by hand.
* Analysis sheets that reference other analysis sheets are copied alone; the report lists the dangling references. Charts/images and form controls inside an analysis sheet are not copied (none of the 581 live sheets has charts).
* BOQ per-deck counts (`M:AF`) are not modelled: the quantity is written as one number in `BOQ!I`.

## Known environment notes

* The Prisma VS Code extension (Prisma 7 language server) warns about `url` in `schema.prisma`; the project pins Prisma 6 where it is correct.
* `npm install` needs `legacy-peer-deps` (set in `backend/.npmrc`) because npm 10.9 crashes on the vite 7 / vitest 4 peer-dependency set.

## Generated workbook on the web, benchmarking and PDF

The "Generated workbook & PDF" tab renders the quotation as a clickable web workbook instead of an Excel file: sheet tabs at the bottom (ELENCO COSTI plus one evaluated analysis sheet per row), a formula bar showing the clicked cell's formula, value and source, yellow input cells editable in place (quantity, dimensions, parameters such as `N3`/`N4`, manual unit cost), and the computed cells refreshed through the app engine. **Export PDF** downloads the ELENCO COSTI as a landscape PDF (`GET /api/quotations/:id/elenco-costi.pdf`); **Print** uses the browser's print view of the current sheet. `GET /api/quotations/:id/workbook` returns the grid.

Selecting a row shows the **historical benchmark** (`GET /api/quotations/:id/items/:itemId/benchmark`): the most similar reference analyses with their source workbook/sheet/cell, client, date, quantity, dimensions, parameters and unit cost, min/median/max against this row's cost, a per-category cost comparison (materials, labour, installation…) and the historical quotations they come from.

## Material market history

Open a material for 15-day, 1-month, 6-month or 1-year charts. `GET /api/materials/:id/prices?range=6m` downloads monthly US BLS producer-price indexes directly from the public API, stores observations in PostgreSQL and refreshes after 24 hours. `npm run db:seed-materials` also installs the explicit material-to-index mappings.

Charts display published price indexes in their original units, with no estimated EUR/unit view. Daily lines interpolate monthly observations positioned at month end; dates after the last observation hold that level constant. No daily market movement is fabricated. The UI shows original index values, preliminary flags, retrieval date and source links. Broad category proxies (including lumber for teak and iron/steel for stainless) are identified explicitly; they are US trends, not European supplier quotes. Provider failures surface as errors, without synthetic history or silently stale data.

## Project workspace MVP

Projects open at `#/projects/:id`. Save a customer brief/meeting transcript, ask project questions, and review a proposed quotation copy with exact item exclusions before creating a draft. Saved conversations and proposals live in PostgreSQL. Copies keep retained quantities, dimensions, overrides and customer/project links; originals stay unchanged. Stale proposals must be refreshed.

Both project search bars use the existing `OPENAI_API_KEY` / `OPENAI_MODEL` configuration and structured LLM results validated against owned project records. When the provider is unavailable (including API quota limits), the UI explicitly labels **Preview mode**: deterministic name/customer/item matching over the same records supports simple reuse and exclusion demos. It does not simulate a successful model response. A failed provider is retried after five minutes. Briefs accept pasted text; automatic audio transcription is not included in this MVP.

## Dashboard and customer overview

Dashboard is the first sidebar tab and default landing page. It filters owned quotation data by date, customer and status, showing monthly estimated costs, a quotation histogram, customer portfolio, product quantities and material demand. Product and material quantities retain their units; incompatible BOM bases are excluded and disclosed. Usage means quotation demand, not actual purchasing or production. Revisions count separately. The Customers tab includes account summaries, activity charts, contacts and direct project/quotation links. Material pages show published market indexes and linked products; mock purchase-rate panels have been removed.

## Report email templates

After a successful Excel/PDF download, an email composer offers directory contacts and editable report-sharing, cost-update and follow-up templates. The quotation header also has **Email contacts**. **Open email draft** opens the default mail app; attach the downloaded report there and send it yourself. No SMTP/email-provider setup or automatic sending is included.
