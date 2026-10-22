# Work log

- 2026-10-21: Quotation UI wording/exports cleanup pushed to PR #17; no browser was available for visual checks.
- 2026-10-21: Repaired seeded quote-to-reference links and removed lookup fallback; frontend 13/13, backend 72/72 pass.
- 2026-10-21: Added customer-linked projects, project contact/quotation tabs, multi-chat tabs, and salesman role; repaired seed customers and linked all 26 quotations. Frontend 13/13, backend 72/72 pass.
- 2026-10-21: Fixed stale-session salesperson identity; added project editing and searchable/sortable/paginated customers. Imported 20 mock-priced materials with 2,889 persisted product quantities and visible lots; frontend 15/15, backend 74/74 pass.
- 2026-10-21: Material charts: 15d/1m/6m/1y, real BLS monthly indexes, labelled interpolated EUR estimates and source observations; 20 materials mapped, 80 live range checks passed. No commits.
- 2026-10-21: Removed quotation Add products and Checks & exports tabs; kept Items & costs, Cost breakdown and header export actions.
- 2026-10-21: Added natural-language project search, openable project briefs/transcripts and saved chats; reviewable quotation copies exclude matched items. LLM quota hit, so preview mode is explicit. Frontend 20/20, backend 88/88; live jacuzzi-copy flow verified. Uncommitted.
- 2026-10-21: Restarted Vite with a fresh dependency cache; fixed IPv4 access and pinned port 5173. Site, session and project APIs respond on both localhost and 127.0.0.1.
- 2026-10-21: Removed estimated EUR/unit view from material charts; charts now show published market indexes only.
- 2026-10-21: Dashboard is now the first/default tab: customer/date/status filters, quotation/cost charts and unit-aware product/BOM demand. Polished Customers with stats/charts; removed material mock-price panels. Live dashboard totals reconciled against all 26 quotations.
- 2026-10-21: Added post-download contact email drafts with three editable templates; sending and report attachment happen in the user's mail app. Frontend 23/23 and backend 94/94 tests pass; builds and live dashboard checks pass.
- 2026-10-21: Rebuilt both apps; all 117 tests pass. Restarted backend/frontend; verified production assets and authenticated APIs on localhost and IPv4.
- 2026-10-22: Refined dashboard priorities and shared site styling; seven pages checked on desktop/mobile. Rebuilt 3D viewer after review with Claude: product framing, glazed/tapered geometry, softer lighting, dimensions and camera controls. Frontend 25/25 pass; 16 scene variants checked.
