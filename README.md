# Somec quotation cost-analysis generator (MVP)

Turns Somec's historical "Analisi" Excel workbooks into a searchable catalog of product cost analyses, lets an estimator build a cart of analyses (semantic search + similar-product suggestions, editable quantity and technical parameters), and generates a new, formula-preserving `.xlsx` cost-analysis workbook from a template workbook, with a validation report.

Costs everywhere in this tool are **estimated costs** read from the workbooks. Selling prices and margins live in Somec's separate commercial file, which is not part of this project.

## Stack

| Part | Tech |
|---|---|
| Backend | NestJS 11 (CommonJS, strict TypeScript), Prisma 6 on PostgreSQL (projects, cart items, generation history) |
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
backend/src/modules/   catalog (search, embeddings), projects (cart, Prisma), generation, prisma
backend/src/scripts/   extract-catalog
backend/prisma/        schema.prisma (PostgreSQL)
frontend/src/          App, components/{ProjectSetup,ProductSearch,Cart}, api.ts
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

Tests (real workbooks, ~30 s):

```bash
cd backend && npm test
```

## Workflow

1. **Project setup** – create a project (name, customer, reference = offer number such as `TM2099-00`, date, estimator) and pick the template workbook. The template provides the price list (`DATI GEN.`), budget and indirect-cost structure; its own items are emptied in the output.
2. **Find an analysis** – type a description (e.g. `prefabricated balcony 1600x2560`, `glass railing for cabin balcony`); results are ranked by embedding similarity plus text/dimension matching and show the source workbook, sheet, item code, historical quantity and unit cost. Selecting one shows its description, cost breakdown, source cells, extraction notes and **similar analyses**.
3. **Cart** – add the analysis with a new quantity and the permitted technical parameters (the literal input cells of the sheet, e.g. `INTERASSE BALCONY N3`, `PROFONDITA' BALCONY N4`). Edit position, item code, description, unit, quantity, dimensions inline. Validation runs on every change: missing/invalid quantities, missing sheets, incompatible sheets (analysis sheets that reference other analysis sheets copied from another workbook), cross-workbook price-list warnings, duplicate codes.
4. **Generate Excel Analysis** – the backend copies the template, writes DATI GEN., ELENCO COSTI and BOQ rows, copies each analysis sheet under its new row number, writes the workbook's own row-401 `INDIRECT` formulas into `costi parz.`/`quantità`/`MDO`, sets `fullCalcOnLoad`, recalculates with Excel when scriptable, validates and saves `data/output/<ref>_<timestamp>/<ref> Analisi.xlsx` + `validation_report.json`. The UI shows the report and download links.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/catalog/facets` | workbooks, categories, embedding status |
| GET | `/api/catalog/search?q=&workbook=&category=&limit=&mode=lexical` | hybrid search (`semantic:false` + `embeddingStatus` while the index warms up) |
| GET | `/api/catalog/:id` · `/api/catalog/:id/similar` | record, nearest neighbours |
| GET/POST/PATCH/DELETE | `/api/projects[/:id]` | projects |
| POST/PATCH/DELETE | `/api/projects/:id/items[/:itemId]` | cart lines (only position, item code, description, unit, notes, quantity, L/H, params are editable; provenance comes from the catalog) |
| GET | `/api/projects/:id/validation` | issues + indicative total |
| POST | `/api/projects/:id/generate` | generate + validate |
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

* **Excel recalculation.** Excel is installed, but on this machine it is currently blocked by a dialog (sandbox file-access / first-run) that the terminal cannot see: AppleScript answers `every workbook doesn't understand the "count" message`. The generator therefore produces a **draft** (`status: requires_review`, `recalculation.performed: false`); open it in Excel, it recalculates on load (external-link prompt: choose "don't update"). To enable automatic recalculation: open Excel manually, dismiss any dialog, allow file access to the repository folder when asked, then `GET /api/generation/excel-status?refresh=1` should say available. `SOMEC_DISABLE_EXCEL=1` disables the attempt.
* Cross-workbook copies get the template's price list: codes that do not exist there are listed in the report (`missingCodes`) and show as `#N/A` after recalculation, exactly as they would if an estimator copied the sheet by hand.
* Analysis sheets that reference other analysis sheets are copied alone; the report lists the dangling references. Charts/images and form controls inside an analysis sheet are not copied (none of the 581 live sheets has charts).
* BOQ per-deck counts (`M:AF`) are not modelled: the quantity is written as one number in `BOQ!I`.

## Known environment notes

* The Prisma VS Code extension (Prisma 7 language server) warns about `url` in `schema.prisma`; the project pins Prisma 6 where it is correct.
* `npm install` needs `legacy-peer-deps` (set in `backend/.npmrc`) because npm 10.9 crashes on the vite 7 / vitest 4 peer-dependency set.
