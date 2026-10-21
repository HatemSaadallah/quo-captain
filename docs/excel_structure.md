# Somec "Analisi" workbook architecture

Reverse-engineered from the six real files in `data/input` (TM1641-03, TM1643-06, TM1823-03, TM1837-02, TM2030-00, TM2086-01; 706 worksheets, 589 item rows, 581 of them with a live analysis sheet). Everything below was read programmatically from the OOXML parts (formulas **and** cached values) with `backend/src/common/utils/xlsx-reader.ts`; nothing is assumed from the task description.

## 1. Worksheet inventory

| Sheet | Rows × cols (typical) | Role | Inputs or outputs |
|---|---|---|---|
| `DATI GEN.` | 9 800 × 17 | Project header (`B5:C11`) **and** the whole material/labour price list (rows 19+), organised in named blocks (`VETRI_TAMPONAMENTI_CIECHI`, `PROFILI_E_MATRICI_ALLUMINIO`, `GUARNIZIONI`, …, 25 workbook-level names pointing at `'DATI GEN.'!$A$n`). | Inputs (prices, header). `C5` is a formula deriving the offer number from the **file name**. |
| `BOQ` | ~150–460 × 50 | Bill of quantities: one row per item with cut-out/finished L×H, pieces per deck (`M:AF`), totals `I` (pcs), `J` (m), `K` (m²). | Inputs (dimensions, per-deck counts). `C` looks the description up in ELENCO COSTI. |
| `ELENCO COSTI` | 545 × 27 | Item-by-item cost list, rows 6–400. **The row number is the key of the whole workbook**: the analysis sheet of the item in row *N* is named `N`, and row *N* of every aggregation sheet belongs to it. Row 402 = `TOTAL COST`, rows 406+ = summary by position (`SUMIF`). | `A:D, F:G, M` inputs; `E = BOQ!I<r>`; `H, I, J, K, L, P, R:AA` formulas. `J = ROUND('costi parz.'!$BE<r>,1)`. |
| numeric sheets (`10`, `11`, …) | ~450–700 × 30 | One product cost analysis each (copied from `Vergine`). | See §3. |
| `Vergine` | 447 × 33 | Blank analysis template. | – |
| `costi parz.` | 402 × 58 | Unit cost of each item split in 54 cost categories (`G:BD`), plus labour in € (`C:E` from `MDO` minutes × hourly rate), `BE = SUM` = unit cost. | Rows 6–400: `A,B,C:F,BE` formulas, `G:BD` **pasted values**. Row **401** holds the live template formula per column (`SUMIF(INDIRECT("'"&$A401&"'!D3:D65"),G$5,INDIRECT("'"&$A401&"'!G3:G65"))`). |
| `costi tot.` | 545 × 89 | `costi parz.` × quantity (`'costi parz.'!X<r>*'ELENCO COSTI'!$E<r>`), column totals in row 5, macro-category sums `CB:CK`. | All formulas. |
| `quantità` | 544 × 98 | Physical quantities per category (kg, m², h…) for each item: `D:F` from MDO minutes, `G:BD` from the sheet via `INDIRECT`, `BI:BM` labour minutes, `BP:CT` glass m² per glass code (feeds `DATI GEN.!L21:L50`). Rows 405+ summary by position. | Rows 6–400 values; row 401 live template formulas. |
| `MDO` | 542 × 21 | Labour minutes per unit (`C:E` = MDOLAV, MDOASS, MDOEST) and totals in h. | Rows 6–400 values ("TABELLA INPUT MANODOPERA"); row 401 template formula converts the sheet's labour € back to minutes. |
| `BDG Costi` | 97 × 186 | Budget by cost code `S01…S10` reading `costi tot.` row 5 and `quantità` row 402; indirect-cost allocation table (rows 72+); hourly rates from `DATI GEN.!C57:C62`. | Formulas. Column `I` holds the category codes (`PROG`, `ALUPRO`, `POSA`, …) that every analysis sheet's `D3:D65` uses. |
| `indiretti` | 368 × 23 | Indirect costs (engineering, site management, insurance…) with `SUMIF` over an input table at rows 41+; `O5` references the external commercial workbook. | Mixed. |
| `Cash Flow`, `Esplosione`, `Espl. pre correz.`, `APPOGGIO`, `Carpenterie`, `Appunti`, `Export`, `Struttura di cantiere MA*` | – | Reporting / scratch sheets. `APPOGGIO` is an analysis-sheet layout used as a scratch pad. | Not touched by the generator. |

Sheet names such as `105old`, `115 OLD`, `191 oLD`, `Originale 81 TM1176`, `136_Old` are archived variants: they still compute (their `R1` formula yields a non-numeric name, so `R2 = 0` and they are ignored by every lookup). Only sheets whose name is exactly a number are live.

## 2. Data flow

```
                        file name  ──CELL("FILENAME")──►  DATI GEN.!C5 (offer n°)
BOQ!I<r> (qty) ──► ELENCO COSTI!E<N> ──INDIRECT("'ELENCO COSTI'!E"&R1)──► '<N>'!T3 (n° elements)
ELENCO COSTI!B<N> (item) ◄──VLOOKUP(R2,'costi parz.'!A:B)── '<N>'!T2    (R1 = own sheet name)
ELENCO COSTI!C<N> (description) ──VLOOKUP(T2)──► '<N>'!B1
DATI GEN. price list ──VLOOKUP(code,'DATI GEN.'!$A:$H)──► '<N>' line items rows 71+ (S = €/UM, J = kg/m, P = UM, Q = category)
'<N>'!D3:D65 (category) / G3:G65 (unit €) ──INDIRECT SUMIF──► costi parz.!G<N>:BD<N> ──SUM──► costi parz.!BE<N>
costi parz.!BE<N> ──ROUND(,1)──► ELENCO COSTI!J<N> (unit cost) ──×E──► K<N> ──SUM──► K402 (TOTAL COST)
costi parz. × ELENCO COSTI!E ──► costi tot. ──row 5──► BDG Costi (budget by cost code) ──► indiretti / Cash Flow
'<N>'!F3:F65 (qty) ──INDIRECT──► quantità ──row 402──► BDG Costi!D (quantities), DATI GEN.!L21:L50 (glass m²)
'<N>' labour € ──/rate×60──► MDO (minutes) ──► costi parz.!C:E (€) and quantità!D:F (h)
```

Key consequences for generation:

* An analysis sheet is self-identifying: copy it, name it `N`, and it binds itself to row `N` of ELENCO COSTI / costi parz. through `CELL("FILENAME")` + `INDIRECT`. No formula inside the sheet references its own name literally.
* Rows 6–400 of `costi parz.`, `quantità`, `MDO` hold **values**, not formulas (the volatile `INDIRECT` formulas live only in row 401 to keep the workbook responsive). A new item row therefore needs those template formulas written into it (the generator shifts row 401's formulas to row `N`), otherwise `BE<N>` stays 0.
* The `ELENCO COSTI!J` value shown for a historical item can be slightly stale with respect to `'<N>'!E67` (pasted values); the catalog reports both and warns when they differ by more than 0.1 €.
* Cross-sheet references **between** analysis sheets exist in a minority of sheets (e.g. TM1643-06 `221 → 134,135,138`, TM2086-01 `191 → 11,13,25,…`) and some contain `#REF!`. Copying such a sheet alone yields `#REF!` or links to the wrong product; the catalog flags `dependsOnSheets` and the project validator blocks cross-workbook use of them.

## 3. Anatomy of an analysis sheet (`'10'` of TM1643-06, item 01-01)

| Area | Cells | Content |
|---|---|---|
| Identity | `R1 = MID(CELL("FILENAME",A1),FIND("]",…)+1,255)`, `R2 = VALUE(R1)`, `T2 = VLOOKUP(R2,'costi parz.'!$A$6:$B$401,2,0)`, `B1 = VLOOKUP(T2,'ELENCO COSTI'!$B$6:$C$400,2,0)`, `T9 = VLOOKUP(T2,…,12)` (product class, e.g. `L1201`) | formulas |
| Unit of analysis | `T1` ∈ {`PZ`, `ML`, `MQ`} | **input** |
| Quantity | `T3 = INDIRECT("'ELENCO COSTI'!E"&R1)` (scaled by `N5`/`N3` when `T1` is `MQ`/`ML`), `T4` (m), `T5` (m²) | formulas |
| Parameters | `J3:N9`: label in `J`, unit in `M`, value in `N`. `N3`/`N4` are the main dimensions (labels vary per product: INTERASSE/PROFONDITA' BALCONY, LARGHEZZA/ALTEZZA TOTALE ELEMENTO, LUNGHEZZA BALAUSTRA…). `N5 = N4/1000*N3/1000`. Some sheets derive `N3` from other cells (e.g. `=L8*L9`, `=Z59`). | input when literal; the catalog marks them `editable` |
| Options | `P33:T40` (`SI`/`NO` switches, e.g. "GRONDA BICOLORE ?") | inputs |
| Cost summary | rows 3–65: `B` label, `C` code (`01-01`…`10-01`), `D` category (`PROG`, `ALUPRO`, `VETRO`, `MDOLAV`, `POSA`, `TRASP`, …), `E` unit (`=BDG Costi!C<n>`), `F = SUMIF($Q$70:$Q$500,$D,$R$70:$R$500)` quantity, `G = H/$L$66` unit cost, `H = SUMIF(…,$T$70:$T$500)` total, `I` share | formulas |
| Totals | `L66` quantity analysed, `L67 = ROUND(SUM(H3:H65),2)`, **`E67 = L67/L66` = unit cost**, `E68` direct-cost part, `L68` general-cost part, `T67` total weight, `T68` unit weight | formulas |
| Line items | rows 71–~470 in sections (PROFILI DI ALLUMINIO, LAMIERATI, VETRI, GUARNIZIONI, …, MANODOPERA, TRASPORTI, …). Per row: `B` description (often `=VLOOKUP(C,'DATI GEN.'!A:H,2)`), **`C` price-list / drawing code (input)**, `E`/`F` L/H mm, `G` pieces per unit (input), `H` m², `J` kg/m (`VLOOKUP(C,…,5)`), `K = G*$T$3`, `L` m, `N` kg, `O` scrap %, `P` UM, `Q` category code (`VLOOKUP(C,…,9)`), `R` quantity, `S` €/UM (`VLOOKUP(C,'DATI GEN.'!$A:$G,3)`), `T = S*R`, `W` filter flag | mixed |
| Features | 83 merged ranges, 20 data validations, 49 conditional formats, comments (legacy VML drawing), print area, autofilter on `W` | preserved by copying the part verbatim |

## 4. References that depend on names, rows or external files

* **Sheet name**: every analysis sheet (`R1`), every INDIRECT in row 401 of `costi parz.`/`quantità`/`MDO`, `ELENCO COSTI!V<r> = INDIRECT(ADDRESS(68,20,1,TRUE,$L<r>))` (unit weight from `'<N>'!T68`).
* **Row number**: `ELENCO COSTI!L<r> = ROW(B<r>)`, `costi parz.!A<r> = ROW()`, and the whole row-aligned design (ELENCO COSTI ↔ costi parz. ↔ costi tot. ↔ quantità ↔ MDO).
* **File name**: `DATI GEN.!C5` (offer number) – the generated file must be named `<reference> Analisi.xlsx`.
* **External workbooks** (all missing on this machine, kept untouched by the generator): `<offer> Analisi.xlsb` (self reference), `<offer>.xlsb` (commercial file used by `indiretti!O5 = '[2]Chiusura - Budget'!$G$78`), and in TM2086-01 `[1]Struttura di cantiere MA`. Opening in Excel shows the usual "update links" prompt; the automation opens with `update links do not update links`.
* **Defined names**: 25 workbook-level names into `DATI GEN.` (price-list blocks), sheet-scoped `_FilterDatabase` and `Print_Area` per analysis sheet (the generator recreates them for copied sheets).

## 5. Workbook features that must survive generation

Styles (cellXfs, dxfs for conditional formats, custom number formats), merged cells, data validations, conditional formatting, comments + VML, column widths/row heights, external link parts, defined names, hidden `wvu` custom-view names, `calcPr`. The generator edits the zip parts in place and never rewrites untouched parts, which is why these survive; see `backend/src/common/utils/xlsx-editor.ts`. The calc chain is dropped and `fullCalcOnLoad="1"` set so Excel recomputes everything on open (and the AppleScript recalculation step does it eagerly when Excel is scriptable).

## 6. Facts verified against the files

| Fact | Where |
|---|---|
| TM1643-06 item `01-01` PRE-FAB BALCONY Type 1 1.600×2.560 mm, qty 712 pcs, unit cost **1 090.70 €** | `'ELENCO COSTI'!B10, E10, J10`; `'10'!E67 = 1 090.74` |
| TM1823-03 (repeat project) item `01-01`, unit cost **1 110.00 €** | `'ELENCO COSTI'!J10` |
| TM1641-03 `DATI GEN.!C5 = #VALUE!` (offer number formula broken: file name has no `.xls` before "Analisi"? – cached error) and 3 items (`11-02`, `12-01`, `15-04`) without analysis sheet | catalog warnings |
| Cross-sheet dependencies between analysis sheets | TM1643-06 `221→134,135,138`, `226→30,31`; TM2086-01 `191`, `192`, `193`, `200`–`205` |
| Error cells inside analysis sheets (mostly `#N/A` from codes not in the price list, e.g. "Da caricare") | 871 in TM1643-06, 2 386 in TM2030-00 |

Costs in these files are **estimated costs**; profit and selling prices live in the separate commercial `.xlsb` file that is not provided.
