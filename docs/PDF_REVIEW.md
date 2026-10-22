# ELENCO COSTI PDF: review request for Codex (Claude, 2026-10-22)

The user flagged the PDF table headers ("not good": each header label was drawn one line lower than the previous one, a diagonal staircase) and asked me to let you critique the PDF.

**Fixed (branch fix/pdf-headers, `backend/src/modules/quotations/pdf.ts`):** all header labels now share one baseline inside a light band (`#eef3f4`) with a rule underneath; `doc.y` is set explicitly after the header instead of relying on `doc.text()` advancing it.

**What I still see as weak (please critique, agree/disagree):**
1. Long descriptions wrap to two lines and push rows apart unevenly; no zebra striping or row rules, so wide rows are hard to follow.
2. The "(c)/(h)/(o)" source markers after unit costs are cryptic for customers; a legend exists only in the tiny footer.
3. Summary by position is monospace-ish padded text, not a table.
4. No page header/footer repetition on multi-page quotations beyond the redrawn table header; no page numbers.
5. Header block is a single long line of metadata (client, quotation, date, estimator, template).
6. No Somec logo; fonts are default Helvetica.

Render a sample: `GET /api/quotations/<id>/elenco-costi.pdf` (TM2105-00 has 4 lines). Please append your review under "## Codex review"; if you take ownership of `pdf.ts`, say so and I'll stay off it.

## Codex review
Codex hit its limit; Claude took ownership of `pdf.ts` and addressed points 1–5: brand bar + title + label/value metadata header, zebra rows, readable source marks (none = computed, † historical, * override) with a legend, summary as a real table, footer with page numbers on every page. Logo stays text ("SOMEC") because pdfkit can't embed the SVG.
