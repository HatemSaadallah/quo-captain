/**
 * Cell map of the Somec "Analisi" workbooks, verified against the six real
 * files in data/input (see docs/excel_structure.md and docs/cell_mapping.md).
 */

export const SHEETS = {
  datiGen: 'DATI GEN.',
  boq: 'BOQ',
  elencoCosti: 'ELENCO COSTI',
  bdgCosti: 'BDG Costi',
  indiretti: 'indiretti',
  mdo: 'MDO',
  costiParz: 'costi parz.',
  costiTot: 'costi tot.',
  quantita: 'quantità',
  vergine: 'Vergine',
} as const;

/** Sheets every template must contain for generation to be meaningful. */
export const REQUIRED_SHEETS = [
  SHEETS.datiGen,
  SHEETS.boq,
  SHEETS.elencoCosti,
  SHEETS.bdgCosti,
  SHEETS.mdo,
  SHEETS.costiParz,
  SHEETS.costiTot,
  SHEETS.quantita,
];

/** A live product-analysis sheet is named exactly by its ELENCO COSTI row number. */
export const isAnalysisSheetName = (name: string): boolean => /^\d+$/.test(name);

/** DATI GEN.: project header cells (B = label, C = value). */
export const DATI_GEN = {
  offerNo: 'C5', // formula: derived from the file name via CELL("FILENAME")
  date: 'C6',
  client: 'C7',
  project: 'C8',
  estimator: 'C9',
  country: 'C10',
  classSociety: 'C11',
  priceListHeaderRow: 19,
  priceListFirstRow: 21,
  priceList: { code: 'A', description: 'B', cost: 'C', unit: 'D', category: 'I' },
  hourlyRateWorkshop: 'C57', // MANGE
  hourlyRateSite: 'C58', // PO
} as const;

/** ELENCO COSTI: one row per quotation item, row number == analysis sheet name. */
export const EC = {
  headerRow: 3,
  firstRow: 6,
  lastRow: 400,
  /** Row holding the live INDIRECT template formulas in the aggregation sheets. */
  templateRow: 401,
  totalRow: 402,
  cols: {
    pos: 'A',
    item: 'B',
    description: 'C',
    unit: 'D',
    qty: 'E',
    L: 'F',
    H: 'G',
    m2Unit: 'H',
    m2Total: 'I',
    unitCost: 'J',
    totalCost: 'K',
    sheetRef: 'L',
    lotto: 'M',
    prevQty: 'N',
    prevUnitCost: 'O',
    prevTotal: 'P',
  },
} as const;

/** BOQ: bill of quantities; ELENCO COSTI!E links here for most items. */
export const BOQ = {
  headerRow: 6,
  firstRow: 8,
  cols: { pos: 'A', item: 'B', description: 'C', L: 'F', H: 'G', m2Unit: 'H', pcs: 'I', length: 'J', surface: 'K', deckFirst: 'M', deckLast: 'AF' },
} as const;

/** Product-analysis sheet ('10', '11', ...). */
export const ANALYSIS = {
  sheetNameCell: 'R1', // =MID(CELL("FILENAME",A1),...)  -> own sheet name
  sheetNo: 'R2', // =VALUE(R1)
  itemCode: 'T2', // =VLOOKUP(R2,'costi parz.'!A:B,2)
  description: 'B1', // =VLOOKUP(T2,'ELENCO COSTI'!B:C,2)
  unit: 'T1', // input: PZ | ML | MQ
  qty: 'T3', // =INDIRECT("'ELENCO COSTI'!E"&R1) (scaled by unit)
  productClass: 'T9',
  /** Parameter block: label J, unit M, value N, rows 3..9 (N3/N4 are the main dimensions). */
  paramRows: [3, 4, 5, 6, 7, 8, 9],
  paramCols: { label: 'J', unit: 'M', value: 'N' },
  dimWidth: 'N3',
  dimHeight: 'N4',
  summaryFirstRow: 3,
  summaryLastRow: 65,
  summaryCols: { label: 'B', code: 'C', category: 'D', unit: 'E', qty: 'F', unitCost: 'G', total: 'H' },
  unitQty: 'L66',
  unitCost: 'E67', // =L67/L66
  totalCost: 'L67', // =ROUND(SUM(H3:H65),2)
  unitWeight: 'T68',
  lineItemHeaderRow: 70,
  lineItemFirstRow: 71,
  lineItemCols: { description: 'B', code: 'C', listCode: 'D', L: 'E', H: 'F', pcs: 'G', category: 'Q', qty: 'R', unitCost: 'S', total: 'T', flag: 'W' },
} as const;

/** Aggregation sheets: per-item rows aligned with ELENCO COSTI row numbers. */
export const AGG = {
  costiParz: { rowRefCol: 'A', itemCol: 'B', firstCatCol: 'G', lastCatCol: 'BD', unitCostCol: 'BE' },
  quantita: { rowRefCol: 'A', firstCatCol: 'D', lastCatCol: 'BD', extraCols: ['BF', 'BG', 'BI', 'BJ', 'BK', 'BL', 'BM'], glassFirstCol: 'BP', glassLastCol: 'CT' },
  mdo: { rowRefCol: 'A', firstCol: 'C', lastCol: 'G', posCol: 'P', lottoCol: 'Q' },
} as const;

export const KNOWN_WORKBOOKS = [
  'TM1641-03 Analisi.xlsx',
  'TM1643-06 Analisi.xlsx',
  'TM1823-03 Analisi.xlsx',
  'TM1837-02 Analisi.xlsx',
  'TM2030-00 Analisi.xlsx',
  'TM2086-01 Analisi.xlsx',
];
