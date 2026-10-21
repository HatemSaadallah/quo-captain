import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkbookView as WorkbookData } from '../api';
import { WorkbookView } from './WorkbookView';
import { mockFetch, quotation } from '../test-utils';

const wb: WorkbookData = {
  quotationId: 'p1',
  reference: 'TM2099-00',
  generatedAt: '2026-10-21T12:00:00.000Z',
  sheets: [
    {
      name: 'ELENCO COSTI',
      kind: 'elenco',
      cols: ['A', 'B', 'C', 'D', 'E', 'J', 'K'],
      rows: [3, 6, 8],
      cells: [
        { addr: 'A3', v: 'Pos.', kind: 'header' },
        { addr: 'E3', v: 'Q.ty', kind: 'header' },
        { addr: 'B6', v: '01-01', kind: 'input', edit: { itemId: 'i1', field: 'itemCode' } },
        { addr: 'E6', v: 50, kind: 'input', f: 'BOQ!I8', edit: { itemId: 'i1', field: 'quantity' } },
        { addr: 'J6', v: 1097.1, kind: 'formula', f: "ROUND('costi parz.'!$BE6,1)", source: 'computed: TM1643-06 sheet 10', edit: { itemId: 'i1', field: 'unitCostOverride' } },
        { addr: 'K6', v: 54855, kind: 'formula', f: 'J6*E6' },
        { addr: 'A8', v: 'TOTAL COST', kind: 'total' },
        { addr: 'K8', v: 54855, kind: 'total', f: 'SUM(K6:K7)' },
      ],
    },
    { name: '6', kind: 'analysis', itemId: 'i1', title: '01-01 PRE-FAB BALCONY', cols: ['B', 'E', 'N'], rows: [3, 67], cells: [{ addr: 'N3', v: 2560, kind: 'input', edit: { itemId: 'i1', field: 'param', cell: 'N3' } }, { addr: 'E67', v: 1097.083, kind: 'formula', f: 'L67/$L$66' }] },
  ],
};

const benchmark = { itemId: 'i1', query: 'PRE-FAB BALCONY', examples: [], categories: [], quotations: [], stats: { min: null, median: null, max: null, own: 1097.1, unit: 'Pcs' } };

describe('WorkbookView', () => {
  it('renders sheet tabs, shows the formula of a clicked cell and switches sheets', async () => {
    mockFetch((_m, path) => (path.endsWith('/workbook') ? wb : path.includes('/benchmark') ? benchmark : {}));
    render(<WorkbookView quotation={quotation()} onQuotation={vi.fn()} onError={vi.fn()} />);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['ELENCO COSTI', '6']);
    const grid = screen.getByTestId('sheet-ELENCO COSTI');
    await userEvent.click(within(grid).getAllByText('54.855', { exact: false })[0]);
    expect(screen.getByText('=J6*E6')).toBeInTheDocument();
    await userEvent.click(within(grid).getByTitle("=ROUND('costi parz.'!$BE6,1)"));
    expect(screen.getByText("=ROUND('costi parz.'!$BE6,1)")).toBeInTheDocument();
    expect(screen.getByText('computed: TM1643-06 sheet 10')).toBeInTheDocument();
    await userEvent.click(tabs[1]);
    expect(screen.getByTestId('sheet-6')).toBeInTheDocument();
    expect(screen.getByText('2560')).toBeInTheDocument();
  });

  it('edits an input cell in place and patches the item', async () => {
    const onQuotation = vi.fn();
    const fetch = mockFetch((method, path) => (path.endsWith('/workbook') ? wb : method === 'PATCH' ? quotation() : path.includes('/benchmark') ? benchmark : {}));
    render(<WorkbookView quotation={quotation()} onQuotation={onQuotation} onError={vi.fn()} />);
    const grid = await screen.findByTestId('sheet-ELENCO COSTI');
    await userEvent.dblClick(within(grid).getByText('50'));
    const input = screen.getByLabelText('edit E6');
    await userEvent.clear(input);
    await userEvent.type(input, '60{enter}');
    await waitFor(() => expect(onQuotation).toHaveBeenCalled());
    const patch = fetch.mock.calls.find((c) => (c[1] as RequestInit).method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ quantity: 60 });
  });

  it('keeps PDF export out of the workbook tab because export is in the page header', async () => {
    const fetch = mockFetch((_m, path) => (path.endsWith('/workbook') ? wb : path.includes('/benchmark') ? benchmark : {}));
    render(<WorkbookView quotation={quotation()} onQuotation={vi.fn()} onError={vi.fn()} />);
    await screen.findByRole('tab', { name: 'ELENCO COSTI' });
    expect(screen.queryByRole('button', { name: /Export PDF/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some((c) => String(c[0]).endsWith('/elenco-costi.pdf'))).toBe(false);
  });
});
