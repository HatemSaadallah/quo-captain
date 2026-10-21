import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from './DashboardPage';
import { mockFetch } from '../test-utils';
import { parseRoute } from '../route';
import type { DashboardData } from '../api';

const data: DashboardData = { from: '2026-01-01', to: '2026-10-21', customers: [{ id: 'c1', name: 'OMNIX' }], totals: { customers: 1, projects: 1, quotations: 2, active: 1, draft: 1, estimatedCost: 1000, uncostedItems: 0, products: 1, materials: 1, unmappedLines: 0, incompatibleLines: 0 }, months: [{ month: '2026-01', quotations: 2, active: 1, draft: 1, estimatedCost: 1000 }], clients: [{ id: 'c1', name: 'OMNIX', projects: 1, quotations: 2, estimatedCost: 1000, trend: [2] }], products: [{ key: 'product|pcs', id: 'product', name: 'Balcony', unit: 'pcs', quantity: 5, quotations: 2, estimatedCost: 1000, trend: [5] }], materials: [{ id: 'steel', name: 'Steel', unit: 'kg', quantity: 10, quotations: 2, products: 1, mockQuantity: 0, trend: [10] }] };
describe('Dashboard', () => {
  it('is the default route and renders charts with customer and status filters', async () => {
    expect(parseRoute('')).toEqual({ page: 'dashboard' });
    expect(parseRoute('#/catalog')).toEqual({ page: 'catalog', q: undefined, create: false });
    const requests: string[] = []; mockFetch((_method, path) => { requests.push(path); return data; });
    render(<DashboardPage />); const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Monthly estimated quotation cost' });
    expect(screen.getByRole('img', { name: 'Monthly quotation activity histogram' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Balcony quoted quantities (pcs)' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Steel material demand (kg)' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Dashboard customer'), 'c1');
    await waitFor(() => expect(requests.at(-1)).toContain('customerId=c1'));
    await screen.findByRole('img', { name: 'Monthly estimated quotation cost' });
    await user.selectOptions(screen.getByLabelText('Dashboard status'), 'active');
    await waitFor(() => expect(requests.at(-1)).toContain('status=active'));
  });
});
