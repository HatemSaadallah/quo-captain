import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Cart } from './Cart';
import { item, mockFetch, quotation } from '../test-utils';

describe('Cart', () => {
  it('shows the items, the indicative total and validation issues', async () => {
    const p = quotation([item(), item({ id: 'i2', itemCode: '01-02', quantity: 5, historicalUnitCost: 1110, sourceOfferNo: 'TM1823-03', sourceWorkbook: 'TM1823-03 Analisi.xlsx' })]);
    mockFetch((_m, path) => {
      if (path.endsWith('/validation')) return { ok: true, issues: [{ level: 'warning', message: 'Costs differ from the source quotation' }], estimatedTotal: 60085, itemsWithoutCost: 0 };
      if (path.endsWith('/excel-status')) return { available: false, platform: 'darwin', detail: 'Excel blocked' };
      return {};
    });
    render(<Cart quotation={p} onQuotation={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByText(/Costs differ from the source quotation/)).toBeInTheDocument();
    expect(await screen.findByText(/Excel unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Excel Analysis/ })).toBeEnabled();
  });

  it('patches the quantity through the API and disables generation on errors', async () => {
    const onQuotation = vi.fn();
    const p = quotation([item()]);
    const fetch = mockFetch((method, path) => {
      if (path.endsWith('/validation')) return { ok: false, issues: [{ level: 'error', message: 'Reference number is required' }], estimatedTotal: 0, itemsWithoutCost: 0 };
      if (path.endsWith('/excel-status')) return { available: false, platform: 'darwin', detail: '' };
      if (method === 'PATCH') return quotation([item({ quantity: 80 })]);
      return {};
    });
    render(<Cart quotation={p} onQuotation={onQuotation} onError={vi.fn()} />);
    expect(await screen.findByText(/Reference number is required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Excel Analysis/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Generate Excel Analysis/ }));
    expect(fetch.mock.calls.some((call) => (call[1] as RequestInit).method === 'POST')).toBe(false);
    expect(onQuotation).not.toHaveBeenCalled();
  });
});
