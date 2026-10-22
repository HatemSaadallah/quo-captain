# Quo-Captain · 2-minute demo script

**Length:** about 2:00 (roughly 280 spoken words).
**Setup before recording:**
- Backend and frontend running, logged in as the estimator.
- Browser at 100% zoom, sidebar visible.
- `TM1641-03 Analisi.xlsx` ready in Finder for drag-and-drop.
- Product TM1641-03 #135 (inclined windscreen) open in a second tab.
- Insights cache warmed, so each prompt answers instantly: run every prompt below once before recording.

---

## 0:00 – 0:15 · The problem
**Screen:** Dashboard: KPIs, cost trend chart, recent quotations.

> Every Somec quotation starts as an Excel "Analisi": hundreds of lines of glazing, balustrades and decking, costed by hand from old workbooks. It's slow, and all that pricing history is locked inside spreadsheets. Quo-Captain turns it into a single workspace.

## 0:15 – 0:35 · Import existing work
**Screen:** Sidebar → **Import**. Drag `TM1641-03 Analisi.xlsx` onto the drop zone. The review screen shows **Ready / Match needed / Needs review**. Click **Needs review**, then **Accept & import**.

> First we bring in what Somec already has. Drop an Analisi workbook and every line is read and checked against historical analyses. Anything that needs a human is flagged before it's saved. One click and it's a draft quotation, with full import history.

## 0:35 – 0:55 · The quotation
**Screen:** **Open draft quotation**. Click one line to expand its material breakdown. Point at the "don't forget labour / transport" reminder. Click **Download Excel**, then **Download PDF**, and show the PDF briefly.

> Each line is priced from real past jobs. Click it and you see the material breakdown behind the cost. The app reminds you about site labour and transport, which stay outside product cost. Export the native Excel workbook, or a clean PDF for the customer.

## 0:55 – 1:20 · The product, on the ship
**Screen:** Switch to the product tab. Point at the specs, then click the pencil on **Height** and change it. Click **View in 3D on a cruise deck**. Hover the windscreen (it highlights), then click **Ship overview**, then **Installed detail**.

> Every product is a living catalog entry. Edit any spec, dimensions included, and the cost updates. And because sales is about showing, not telling: here it is in 3D, at its real size, on a cruise ship. From the whole vessel down to the exact spot where it's installed.

## 1:20 – 1:45 · Ask the data
**Screen:** Global search → **Insights**. Run these two prompts:
1. "Show a histogram of windscreen unit costs per m²." Show the chart.
2. "Which customer brings the most estimated cost this year, and which product category drives it?"

Then click **Share** to copy the link.

> Years of quotations become something you can simply ask. Plain English in, charts out: unit-cost distributions, top customers, monthly trends. Answers are grounded in our own data, never invented. Share any answer as a link.

## 1:45 – 2:00 · Close
**Screen:** Project page → upload a client requirements file → suggested products → **Create draft quotation**. End on the Dashboard.

> And when a new tender arrives, upload the client's requirements. We suggest matching products and draft the quotation for you. Quo-Captain: Somec's history, now working for every new quote.

---

### Fallbacks if something misbehaves live
- **Insights is slow (LLM rate limit):** use the cached prompts above, or show a pre-shared insight link.
- **3D view is blank:** turn on hardware acceleration in the browser, or switch to **Product only**.
- **Import fails:** open TM2030-00 from the import history instead.
