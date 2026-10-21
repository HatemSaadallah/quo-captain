import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../test-utils';
import { MaterialPriceChart } from './MaterialPriceChart';
import type { MaterialPriceHistory } from '../api';

const history: MaterialPriceHistory = {
  range: '6m', start: '2026-04-21', end: '2026-10-21', basePrice: 4.5, basePriceSource: 'mock', unit: 'kg',
  series: { id: 'WPU102501', title: 'Aluminum mill shapes', units: 'Index 1982=100', sourceUrl: 'https://data.bls.gov/timeseries/WPU102501', fetchedAt: '2026-10-21T10:00:00Z', latestPeriod: '2026-09-30', note: 'US aluminum proxy.' },
  observations: [{ date: '2026-09-30', value: 370.48, preliminary: true }],
  points: [{ date: '2026-04-21', price: 4, index: 329, method: 'interpolated' }, { date: '2026-10-21', price: 4.5, index: 370.48, method: 'carried' }],
};
describe('Material price history', () => {
  it('switches all four periods, exposes source observations and displays published indexes', async () => {
    const requests: string[] = [];
    mockFetch((_method, path) => { requests.push(path); return { ...history, observations: path.includes('range=15d') ? [] : history.observations }; });
    render(<MaterialPriceChart materialId="ALUPRO" />);
    const user = userEvent.setup();
    await screen.findByRole('img');
    expect(screen.queryByRole('button', { name: 'Estimated €/unit' })).not.toBeInTheDocument();
    expect(screen.getByText('Index 1982=100', { selector: 'small' })).toBeInTheDocument();
    for (const [label, range] of [['15 days', '15d'], ['1 month', '1m'], ['6 months', '6m'], ['1 year', '1y']]) {
      await user.click(screen.getByRole('button', { name: label }));
      await screen.findByRole('img');
      expect(requests.at(-1)).toBe(`/api/materials/ALUPRO/prices?range=${range}`);
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
      if (range === '15d') expect(screen.getByText(/daily price movements are unknown/)).toBeInTheDocument();
    }
    expect(screen.getByText(/Index points are not EUR prices/)).toBeInTheDocument();
    await user.click(screen.getByText('View published observations (1)'));
    expect(within(screen.getByRole('table')).getByText('370,48')).toBeInTheDocument();
  });
  it('allows retry after an upstream error', async () => {
    let calls = 0;
    mockFetch(() => ++calls === 1 ? { status: 502, body: { message: 'Provider unavailable' } } : history);
    render(<MaterialPriceChart materialId="ALUPRO" />);
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('img');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
