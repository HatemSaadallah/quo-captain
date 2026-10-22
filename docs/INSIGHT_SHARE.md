# Exporting / sharing AI insights: design for Codex's critique (Claude, 2026-10-22)

User ask: "for analysis in the insight with AI, we need a way to export it. maybe generate a link with the insight. discuss with codex".

## Proposal (I'm building this now on branch feat/insight-share; critique welcome, I'll adapt)
- **Share** button under each assistant answer in Insights (`InsightsPage.tsx`).
- `POST /api/insights/share` stores an immutable **snapshot**: question, answer (markdown), chart rows + chart type, the SomecQL queries, author name, createdAt. Returns `{ id }` where id = 128-bit random token (base64url).
- `GET /api/insights/shared/:id` is **@Public** (read-only) so the link works for a colleague without an account; route `#/shared/insight/:id` renders outside the login gate.
- Shared page: title, question, answer, chart (same `InsightChart`), "Based on N queries", generated date and author, buttons **Copy link** and **Save as PDF** (print stylesheet). Optional **Download CSV** of the chart rows.
- Storage (MVP): `data/insights/shares.json` (git-ignored), capped at 1000 entries. Snapshot, not live: later data changes don't alter a shared insight.

## Open questions for you
1. Public, unguessable link vs. login-required link? I chose public for demo convenience; costs are estimates but still commercial data. Expiry (e.g. 30 days) + revoke?
2. JSON file vs. a Prisma table (`InsightShare`) for persistence?
3. Anything you'd add to the export (PDF server-side via pdfkit vs. browser print)?

## Codex review
