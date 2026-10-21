# Cell mapping

Verified on `TM1643-06 Analisi.xlsx` and cross-checked on the other five workbooks (same positions everywhere; TM1641-03/TM1837-02 use `CP` instead of `Lotto` in `ELENCO COSTI!M3`). "Input" = literal cell the estimator types; "output" = formula. The constants live in `backend/src/excel/somec-schema.ts`.

## DATI GEN. — project header (read by the catalog, written by the generator)

| Cell | Label (B) | Kind | Example (TM1643-06) | Generator |
|---|---|---|---|---|
| `C5` | Offer n° | output `=SUBSTITUTE(UPPER(MID(CELL("FILENAME",A1),FIND("[",…)+1,FIND(".xls",…)-FIND("[",…)-1))," ANALISI","")` | `TM1643-06` | untouched; output file named `<reference> Analisi.xlsx` |
| `C6` | Date | input (serial or text) | 45723 = 2025-03-07 | project date as Excel serial |
| `C7` | Client | input | `APEXA` | project customer |
| `C8` | Project | input | `Nave 1 - Balcony` | project name |
| `C9` | Estimator | input | `Massimo Brun` | project estimator |
| `C10` | Country | input | `EUROPA` | kept |
| `C11` | Classification Society | input | `RINA` | kept |
| `C57` | MANGE hourly rate (workshop) | input | 35 | kept; used by `costi parz.!C:E`, `MDO` |
| `C58` | PO hourly rate (site) | input | 32 | kept; used by `costi parz.!F` |
| `A21:I9803` | price list: `A` code, `B` description, `C` cost, `D` UM, `E:H` notes/supplier/date, `I` category code | inputs | `TA2 … VS 44.4 … 55 MQ … VETRO` | kept; analysis sheets `VLOOKUP` into it |

## ELENCO COSTI — item rows 6..400 (row N ↔ sheet `N`)

| Col | Header | Kind | Formula / value | Catalog field | Generator writes |
|---|---|---|---|---|---|
| `A` | Pos. | input | `01` | `position` | yes |
| `B` | Item | input | `01-01` | `itemCode` | yes |
| `C` | DESCRIPTION | input (multi-line) | | `description`, `title` (first line) | yes |
| `D` | M.U. | input | `Pcs`, `m²`, `m` | `unit` | yes |
| `E` | Q.ty | output `=BOQ!I<boqRow>` (sometimes typed) | 712 | `quantity` | `=BOQ!I<boqRow>` |
| `F` | L (mm) | input | 2560 | `L` | yes |
| `G` | H (mm) | input | 1600 | `H` | yes |
| `H` | m² unit | output `=IF(AND(D="m",G<>0),G/1000,G*F/1000000)` | 4.096 | `m2Unit` | kept (written if missing) |
| `I` | m² total | output `=IF(D="m²",E,H*E)` | | | kept |
| `J` | Unit Cost € | output `=ROUND('costi parz.'!$BE<N>,1)` | **1090.7** | `unitCost` | kept |
| `K` | Total Cost € | output `=J*E` | 776 578.4 | `totalCost` | kept |
| `L` | Detail sheet ref. | output `=IF(B="",0,ROW(B))` | 10 | | kept |
| `M` | Lotto / CP | input | `L1201` | `lotto` | yes |
| `N:P` | previous version qty / unit cost / total | inputs + `=O*N` | | | cleared |
| `V` | unit weight | output `=INDIRECT(ADDRESS(68,20,1,TRUE,$L))` → `'<N>'!T68` | | | kept |
| `AA` | site hours | output `=quantità!$G<N>` | | | kept |
| `I402`, `K402` | TOTAL m² / TOTAL COST | `=SUM(I6:I400)`, `=SUM(K6:K401)` | 6 533 246.00 | `WorkbookSummary.totalCost` | validator reconciles |
| `A406:K420` | summary by position | `=SUMIF($A$6:$A$401,$A406,K$6:K$401)` | | `categoryName` (C) | kept |

## BOQ — one row per item from row 8

| Col | Header | Kind | Generator writes |
|---|---|---|---|
| `A` Pos., `B` Item | inputs | yes |
| `C` DESCRIPTION | output `=IFERROR(LEFT(VLOOKUP(B,'ELENCO COSTI'!$B$5:$C$400,2,0),SEARCH(CHAR(10),…)),LEFT(…,50))` | yes (same formula) |
| `D:E` cut-out L/H, `F:G` finished L/H (mm) | inputs | `F`, `G` |
| `H` m² unit `=$F*$G/1000000` | output | yes |
| `I` Pcs `=SUM(M:AF)` (per-deck counts) | output in the originals | **quantity value** (the per-deck split is not modelled) |
| `J` Length `=F*$I/1000`, `K` Surface `=H*$I` | outputs | yes |

## Analysis sheet `'<N>'`

| Cell(s) | Kind | Meaning | Catalog / generator |
|---|---|---|---|
| `R1`, `R2`, `T2`, `B1`, `T9` | output | identity by sheet name (see excel_structure.md §3) | validator checks they are intact |
| `T1` | input | unit of analysis `PZ`/`ML`/`MQ` | `analysisUnit` |
| `T3`, `T4`, `T5` | output | quantity from `ELENCO COSTI!E<N>` | `sourceCells.sheetQty` |
| `N3`, `N4`, (`N7:N9`) | input when literal | technical parameters, label in `J`, unit in `M` | `params[]` with `editable`; generator writes edited values |
| `N5` | output `=N4/1000*N3/1000` | surface | `editable=false` |
| `D3:D65`, `F3:F65`, `G3:G65`, `H3:H65` | output | per-category code / quantity / unit cost / total | `costBreakdown[]` |
| `L66` | output | quantity in the analysis unit | |
| **`E67`** | output `=L67/$L$66` | **unit cost** | `sheetUnitCost` |
| `L67` | output `=ROUND(SUM(H3:H65),2)` | total cost of the analysed quantity | `sheetTotalCost` |
| `T68` | output | unit weight kg | `unitWeightKg` |
| `C71:C~470` | input | price-list codes (looked up by `VLOOKUP(C,'DATI GEN.'!…)`) | `codesUsed`; validator reports codes missing in the template price list |
| `G71:G~470`, `E`, `F` | inputs | pieces per unit, dimensions | kept as copied |
| `S`, `T`, `Q`, `P`, `J` | outputs | €/UM, total, category, UM, kg/m from the price list | kept |

## costi parz. / quantità / MDO — row N

| Sheet | Columns | Rows 6..400 in the originals | Row 401 | Generator (row N of a new item) |
|---|---|---|---|---|
| `costi parz.` | `A` `=IF(B<>0,ROW(),0)`, `B` `='ELENCO COSTI'!$B`, `C:E` `=MDO!C/60*'DATI GEN.'!$C$57`, `F` `=G/'DATI GEN.'!$C$58`, `BE` `=SUM(G:BD,C,D,E)` | formulas | formulas | kept |
| `costi parz.` | `G:BD` | **values** | `=IF($A401=0,0,SUMIF(INDIRECT("'"&$A401&"'!D3:D65"),G$5,INDIRECT("'"&$A401&"'!G3:G65")))` | row-401 formula shifted to N |
| `quantità` | `A:C` | formulas | formulas | kept |
| `quantità` | `D:F` | values | `=MDO!$H401/60` … | written |
| `quantità` | `G:BD` | values | `=IF($A401=0,0,IF(G$4="FORFAIT",0,SUMIF(INDIRECT(…D3:D65),G$5,INDIRECT(…$F3:F65))/INDIRECT(…$L66)*'ELENCO COSTI'!$E401))` | written |
| `quantità` | `BI:BM`, `BP:CT` | values | `=MDO!H401` …, glass m² per code via `INDIRECT(…D70:D999 / R70:R999)` | written |
| `MDO` | `A:B`, `H:R`, `U` | formulas | formulas | kept |
| `MDO` | `C:G` | values (minutes per unit) | `=IF($A401=0,0,SUMIF(INDIRECT(…D3:D65),C$5,INDIRECT(…G3:G65)))/'DATI GEN.'!$C$57*60` | written |
| `costi tot.` | all | formulas (`'costi parz.'!X<r>*'ELENCO COSTI'!$E<r>`) | | untouched |

For the template's own historical items the generator empties `ELENCO COSTI!A:D,F:G,M:O` (sets `E=0`), `BOQ` rows 8+, and the value blocks above, so the output's `TOTAL COST` only contains the cart. The old analysis sheets remain in the file (hidden rows of history, harmless: with an empty `ELENCO COSTI` row their `T2=0`, `T3=0`); the cart's sheets go into free rows (first free rows of TM1643-06 are 6, 7, 8, 9, 15, …).
