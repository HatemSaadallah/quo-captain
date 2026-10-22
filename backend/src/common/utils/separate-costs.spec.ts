import { describe, expect, it } from 'vitest';
import { productUnitCost, separateShares } from './separate-costs';

const parts = [
  { category: 'VETRO - vetro', unitCost: 60 },
  { category: 'INSTALLAZIONE DI CANTIERE', unitCost: 25 },
  { category: 'TRASPORTI', unitCost: 15 },
];

describe('separate costs', () => {
  it('splits labour and transport out of a historical cost', () => {
    expect(separateShares(parts)).toEqual({ labour: 0.25, transport: 0.15 });
    expect(productUnitCost({ unitCostOverride: null, historicalUnitCost: 200 }, parts)).toBe(120);
  });
  it('keeps own prices and free lines as they are', () => {
    expect(productUnitCost({ unitCostOverride: 99, historicalUnitCost: 200 }, parts)).toBe(99);
    expect(productUnitCost({ unitCostOverride: null, historicalUnitCost: 50 }, [])).toBe(50);
    expect(productUnitCost({ unitCostOverride: null, historicalUnitCost: null }, parts)).toBeNull();
  });
});
