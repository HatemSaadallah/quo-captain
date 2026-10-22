/**
 * Site labour and transport inside a historical unit cost. Somec quotes them as separate lines, so a product's
 * cost excludes them everywhere: the cost ledger, quotation totals, the dashboard and insights.
 */
export const LABOUR = /INSTALLAZIONE DI CANTIERE|GESTIONE DI CANTIERE|VIAGGI E TRASFERTE/i;
export const TRANSPORT = /TRASPORT/i;

type CostPart = { category: string; unitCost: number | null };

/** Labour and transport shares (0–1) of an analysis, from its cost breakdown. */
export function separateShares(parts: CostPart[]): { labour: number; transport: number } {
  const all = parts.reduce((acc, b) => acc + (b.unitCost ?? 0), 0);
  const share = (re: RegExp): number => (all > 0 ? parts.filter((b) => re.test(b.category)).reduce((acc, b) => acc + (b.unitCost ?? 0), 0) / all : 0);
  return { labour: share(LABOUR), transport: share(TRANSPORT) };
}

/** Product unit cost of a line: an own price is kept as is; a historical cost loses its labour and transport share. */
export function productUnitCost(item: { unitCostOverride: number | null; historicalUnitCost: number | null }, parts: CostPart[]): number | null {
  if (item.unitCostOverride !== null) return item.unitCostOverride;
  if (item.historicalUnitCost === null) return null;
  const { labour, transport } = separateShares(parts);
  return Math.round(item.historicalUnitCost * (1 - labour - transport) * 100) / 100;
}
