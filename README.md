# Somec quotation cost analysis

Work in progress: a NestJS / TypeScript backend and React frontend for finding historical product analyses, assembling project carts, and producing Excel cost-analysis workbooks.

Historical analyses are customizable starting templates. Historical cached costs are indicative; Excel calculations remain authoritative. These workbooks calculate costs, not commercial selling prices.

## Repository organization

- `backend/`: workbook inspection, catalog and semantic search, project cart API, and shared TypeScript interfaces/utilities.
- `frontend/`: React / Vite application scaffold; estimator workflows are still pending.
- `docs/`: implementation review and project documentation.
- `data/input/`: local original Somec Excel workbooks.
- `data/processed/`: generated catalog and embeddings.
- `data/output/`: generated workbooks and validation reports.

The initial implementation is being introduced through draft pull requests. See each PR for validation results and outstanding work.

## Local data and dependencies

Keep the six supplied Excel workbooks in `data/input/`. Source workbooks, generated catalogs, model downloads, local databases, and `node_modules` are not included in the pull requests. Install dependencies separately inside `backend/` and `frontend/` with `npm ci` once their implementation PRs are checked out.

The backend uses SQLite through Prisma and expects `DATABASE_URL` in the environment. A typical local value is `file:./dev.db`; run `npx prisma generate` and `npx prisma db push` in `backend/` after configuring it.

Excel generation and recalculation are not yet verified end to end. The current frontend scaffold does not yet provide a usable estimator workflow.
