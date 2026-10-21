import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ElencoCosti as ElencoCostiData } from '../api';
import { ElencoCosti } from './ElencoCosti';
import { item, mockFetch, quotation, record } from '../test-utils';

const sheet: ElencoCostiData = {
  quotationId: 'p1',
  reference: 'TM2099-00',
  rows: [
    { itemId: 'i1', line: 1, position: '01', itemCode: '01-01', description: 'PRE-FAB BALCONY Type 1', unit: 'Pcs', quantity: 50, L: 2560, H: 1600, m2Unit: 4.096, m2Total: 204.8, unitCost: 1090.7, totalCost: 54535, unitCostSource: 'historical', historicalUnitCost: 1090.7, unitCostOverride: null, tab: { id: 'TM1643-06#10', workbook: 'TM1643-06 Analisi.xlsx', sheet: '10', offerNo: 'TM1643-06' }, lotto: 'L1201', warnings: [] },
    { itemId: 'free', line: 2, position: '04', itemCode: '04-01', description: 'Glass balustrade H 1130', unit: 'm', quantity: 120, L: 2560, H: 1130, m2Unit: 1.13, m2Total: 135.6, unitCost: null, totalCost: null, unitCostSource: 'none', historicalUnitCost: null, unitCostOverride: null, tab: null, lotto: null, warnings: ['no reference analysis attached: unit cost unknown until a tab is attached or overridden'] },
  ],
  totals: { m2Total: 340.4, totalCost: 54535, rowsWithoutCost: 1, complete: false },
  summary: [
    { position: '01', m2Total: 204.8, totalCost: 54535, unitCost: 266.28, rows: 1 },
    { position: '04', m2Total: 135.6, totalCost: 0, unitCost: 0, rows: 1 },
  ],
  formulas: { 'K (total cost €)': 'J*E' },
  note: 'historical',
};

describe('ELENCO COSTI view', () => {
  it('renders the sheet rows, totals and summary', async () => {
    mockFetch((_m, path) => (path.endsWith('/elenco-costi') ? sheet : {}));
    render(<ElencoCosti quotation={quotation([item(), item({ id: 'free', catalogId: null })])} onQuotation={vi.fn()} onError={vi.fn()} />);
    expect(await screen.findByText('TOTAL COST')).toBeInTheDocument();
    expect(screen.getByText('54.535,00 €', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText(/1 row\(s\) without unit cost/)).toBeInTheDocument();
    expect(screen.getByText(/no reference analysis attached/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Attach by similarity/ })).toBeInTheDocument();
    expect(screen.getByText('266,28 €')).toBeInTheDocument(); // summary unit cost €/m²
  });

  it('attaches a suggested reference tab to a free row', async () => {
    const onQuotation = vi.fn();
    const fetch = mockFetch((method, path) => {
      if (path.endsWith('/elenco-costi')) return sheet;
      if (path.includes('/items/free/suggestions')) return [{ record: record({ id: 'TM1643-06#45', title: 'GLASS BALUSTRADE ON ALUMINIUM BALCONY', sheet: '45', unitCost: 224.5 }), score: 0.81, semanticScore: 0.8, lexicalScore: 0.9, matchedTokens: [] }];
      if (method === 'POST' && path.endsWith('/items/free/attach')) return quotation([item(), item({ id: 'free', catalogId: 'TM1643-06#45', sourceSheet: '45', historicalUnitCost: 224.5 })]);
      return {};
    });
    render(<ElencoCosti quotation={quotation([item(), item({ id: 'free', catalogId: null })])} onQuotation={onQuotation} onError={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: /Attach by similarity/ }));
    const suggestion = await screen.findByRole('button', { name: /81% · GLASS BALUSTRADE/ });
    await userEvent.click(suggestion);
    await waitFor(() => expect(onQuotation).toHaveBeenCalled());
    const attach = fetch.mock.calls.find((c) => String(c[0]).endsWith('/items/free/attach'));
    expect(attach).toBeDefined();
    expect(JSON.parse(String((attach![1] as RequestInit).body))).toEqual({ referenceTabId: 'TM1643-06#45' });
  });

  it('sends a manual unit cost override', async () => {
    const onQuotation = vi.fn();
    const fetch = mockFetch((method, path) => {
      if (path.endsWith('/elenco-costi')) return sheet;
      if (method === 'PATCH') return quotation();
      return {};
    });
    render(<ElencoCosti quotation={quotation()} onQuotation={onQuotation} onError={vi.fn()} />);
    const input = await screen.findByLabelText('override unit cost 04-01');
    await userEvent.type(input, '250');
    await userEvent.tab();
    await waitFor(() => expect(onQuotation).toHaveBeenCalled());
    const patch = fetch.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ unitCostOverride: 250 });
  });
});
