export interface MaterialInfo {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  priceSource: string;
  sourceNote: string;
}

export interface RawMaterial extends MaterialInfo { productCount: number }

export interface ProductMaterial {
  id: string;
  quantity: number;
  batchQuantity: number | null;
  productUnit: string;
  quantitySource: string;
  sourceNote: string;
  sourceIndexId: string | null;
  material: MaterialInfo;
}

export interface MaterialDetail {
  material: RawMaterial;
  products: Array<{ id: string; title: string; itemCode: string | null; lot: string | null; quantity: number; productUnit: string; quantitySource: string }>;
}

export type MaterialPriceRange = '15d' | '1m' | '6m' | '1y';
export interface MarketObservation { date: string; value: number; preliminary: boolean }
export interface MaterialPriceHistory {
  range: MaterialPriceRange;
  start: string;
  end: string;
  series: { id: string; title: string; units: string; sourceUrl: string; fetchedAt: string; latestPeriod: string; note: string };
  basePrice: number;
  basePriceSource: string;
  unit: string;
  observations: MarketObservation[];
  points: Array<{ date: string; price: number; index: number; method: 'interpolated' | 'carried' | 'monthly' }>;
}
