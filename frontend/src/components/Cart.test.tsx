import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Cart } from './Cart';
import { item, mockFetch, project } from '../test-utils';

describe('Cart', () => {
  it('shows the items, the indicative total and validation issues', async () => {
    const p = project([item(), item({ id: 'i2', itemCode: '01-02', quantity: 5, historicalUnitCost: 1110, sourceOfferNo: 'TM1823-03', sourceWorkbook: 'TM1823-03 Analisi.xlsx' })]);
    mockFetch((_m, path) => {
      if (path.endsWith('/validation')) return { ok: true, issues: [{ level: 'warning', itemId: 'i2', message: '01 / 01-02: copied from TM1823-03 Analisi.xlsx; costs will differ' }], estimatedTotal: 60085, itemsWithoutCost: 0 };
      if (path.endsWith('/excel-status')) return { available: false, platform: 'darwin', detail: 'Excel blocked' };
      return {};
    });
    render(<Cart project={p} onProject={vi.fn()} onError={vi.fn()} />);
    expect(screen.getAllByDisplayValue('01-01')).toHaveLength(1);
    expect(screen.getByText(/Estimated total/)).toHaveTextContent('60.085,00');
    expect(await screen.findByText(/costs will differ/)).toBeInTheDocument();
    expect(await screen.findByText(/Excel not scriptable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Excel Analysis/ })).toBeEnabled();
  });

  it('patches the quantity through the API and disables generation on errors', async () => {
    const onProject = vi.fn();
    const p = project([item()]);
    const fetch = mockFetch((method, path) => {
      if (path.endsWith('/validation')) return { ok: false, issues: [{ level: 'error', message: 'Reference number is required' }], estimatedTotal: 0, itemsWithoutCost: 0 };
      if (path.endsWith('/excel-status')) return { available: false, platform: 'darwin', detail: '' };
      if (method === 'PATCH') return project([item({ quantity: 80 })]);
      return {};
    });
    render(<Cart project={p} onProject={onProject} onError={vi.fn()} />);
    expect(await screen.findByText(/Reference number is required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Excel Analysis/ })).toBeDisabled();
    const qty = screen.getByDisplayValue('50');
    await userEvent.clear(qty);
    await userEvent.type(qty, '80');
    await userEvent.tab();
    await waitFor(() => expect(onProject).toHaveBeenCalled());
    const patch = fetch.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ quantity: 80 });
  });
});
