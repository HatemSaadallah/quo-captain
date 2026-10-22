import { describe, expect, it } from 'vitest';
import { runQuery } from './somecql';

const data = {
  lines: [
    { customer: 'ACME', year: 2026, category: 'Balcony', total: 100, unit_cost: 10 },
    { customer: 'ACME', year: 2026, category: 'Windscreen', total: 300, unit_cost: 30 },
    { customer: 'APEXA', year: 2025, category: 'Balcony', total: 50, unit_cost: 5 },
    { customer: 'OMNIX', year: 2026, category: 'Glass | doors', total: 70, unit_cost: null },
  ],
};

describe('SomecQL', () => {
  it('filters, groups, aggregates, sorts and limits', () => {
    const r = runQuery('lines | where year = 2026 | group customer | agg sum(total), count() | sort sum_total desc | limit 1', data);
    expect(r.rows).toEqual([{ customer: 'ACME', sum_total: 400, count: 2 }]);
    expect(r.total).toBe(2);
  });

  it('supports contains, in, select and quoted pipes', () => {
    expect(runQuery('lines | where category ~ "glass | doors" | select customer', data).rows).toEqual([{ customer: 'OMNIX' }]);
    expect(runQuery('lines | where customer in (APEXA, OMNIX) | agg min(total), avg(unit_cost)', data).rows).toEqual([{ min_total: 50, avg_unit_cost: 5 }]);
  });

  it('supports or, with brackets kept inside in-lists', () => {
    const r = runQuery('lines | where (year = 2025) or (customer in (OMNIX) and year = 2026) | select customer', data);
    expect(r.rows).toEqual([{ customer: 'APEXA' }, { customer: 'OMNIX' }]);
  });

  it('builds histograms with bucket()', () => {
    const r = runQuery('lines | group bucket(total, 100) | agg count()', data);
    expect(r.rows).toEqual([{ total_range: '0–100', count: 2 }, { total_range: '100–200', count: 1 }, { total_range: '300–400', count: 1 }]);
  });

  it('explains mistakes so the model can correct the query', () => {
    expect(() => runQuery('lines | where colour = red', data)).toThrow(/Unknown field "colour"/);
    expect(() => runQuery('orders', data)).toThrow(/Unknown dataset/);
  });
});
