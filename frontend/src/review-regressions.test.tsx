import { record as makeRecord } from './test-utils';
import { ProjectSetup } from './components/ProjectSetup';
import App from './App';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductSearch } from './components/ProductSearch';
import { Cart } from './components/Cart';
import {
  api,
  type CatalogFacets,
  type CatalogRecord,
  type Project,
  type GenerationResult,
  type SearchHit,
} from './api';

vi.mock('./api', async (original) => {
  const real = await original<typeof import('./api')>();
  return {
    ...real,
    getToken: () => 'test-token',
    api: {
      ...real.api,
      search: vi.fn(),
      similar: vi.fn(),
      validation: vi.fn(),
      excelStatus: vi.fn(),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
      generate: vi.fn(),
      project: vi.fn(),
      updateProject: vi.fn(),
      me: vi.fn(),
      facets: vi.fn(),
      projects: vi.fn(),
      addItem: vi.fn(),
      elencoCosti: vi.fn(),
    },
  };
});
const record = makeRecord();
const other = { ...record, id: 'OTHER#10', title: 'Other selected analysis' };
const hit = (r: CatalogRecord): SearchHit => ({
  record: r,
  score: 0.8,
  semanticScore: 0.8,
  lexicalScore: 0.8,
  matchedTokens: [],
});
const facets: CatalogFacets = {
  generatedAt: '',
  recordCount: 2,
  embeddings: { status: 'ready', model: 'test', error: null },
  workbooks: [],
  categories: [],
  units: [],
};
const project = (id: string): Project => ({
  id,
  ownerId: 'u1',
  name: 'Review ' + id,
  customer: 'Test',
  reference: 'REVIEW-' + id,
  date: '2026-10-21',
  estimator: 'review',
  templateWorkbook: record.workbook,
  items: [
    {
      id: id + '-item',
      catalogId: record.id,
      referenceTabId: null,
      unitCostOverride: null,
      sourceWorkbook: record.workbook,
      sourceSheet: record.sheet,
      sourceOfferNo: record.offerNo,
      position: record.position ?? '',
      itemCode: record.itemCode ?? '',
      description: record.description ?? '',
      unit: record.unit ?? 'Pcs',
      quantity: 2,
      L: record.L,
      H: record.H,
      lotto: record.lotto,
      params: [],
      historicalUnitCost: record.unitCost,
      historicalQuantity: record.quantity,
      dependsOnSheets: [],
      notes: '',
    },
  ],
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
  generations: [],
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const searchProps = () => ({ facets, canAdd: true, onAdd: vi.fn().mockResolvedValue(undefined), onError: vi.fn() });
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.search).mockResolvedValue({
    hits: [hit(record), hit(other)],
    semantic: true,
    embeddingStatus: 'ready',
  });
  vi.mocked(api.similar).mockResolvedValue([hit({ ...other, title: 'Similar reference' })]);
  vi.mocked(api.validation).mockResolvedValue({ ok: true, issues: [], estimatedTotal: 2181.4, itemsWithoutCost: 0 });
  vi.mocked(api.elencoCosti).mockResolvedValue({projectId:'A',reference:'REVIEW-A',rows:[],totals:{m2Total:0,totalCost:0,rowsWithoutCost:0,complete:true},summary:[],formulas:{},note:''});
  vi.mocked(api.excelStatus).mockResolvedValue({ available: false, platform: 'darwin', detail: 'test mode' });
});
describe('frontend behavior review', () => {
  it('shows selected provenance and similar references, then adds valid custom inputs', async () => {
    const props = searchProps();
    render(<ProductSearch {...props} />);
    fireEvent.click(await screen.findByText(record.title!));
    expect(await screen.findByText('Similar reference', { exact: false })).toBeTruthy();
    expect(screen.getByText(record.workbook + ' › sheet ' + record.sheet + ' › row ' + record.row)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/New quantity/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() =>
      expect(props.onAdd).toHaveBeenCalledWith(
        record,
        4,
        expect.arrayContaining([expect.objectContaining({ cell: 'N4', value: 1594 })]),
      ),
    );
  });
  it('rejects a zero quantity without adding an item', async () => {
    const props = searchProps();
    render(<ProductSearch {...props} />);
    fireEvent.click(await screen.findByText(record.title!));
    await screen.findByText('Similar reference', { exact: false });
    fireEvent.change(screen.getByLabelText(/New quantity/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onError).toHaveBeenCalledWith('Quantity must be a positive number');
  });
  it('rejects negative technical inputs before the two-request add sequence starts', async () => {
    const props = searchProps();
    render(<ProductSearch {...props} />);
    fireEvent.click(await screen.findByText(record.title!));
    await screen.findByText('Similar reference', { exact: false });
    fireEvent.change(screen.getByLabelText(/cell N4/), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(props.onAdd).not.toHaveBeenCalled();
  });
  it('saves quantity edits with the correct project and item identity', async () => {
    const p = project('A');
    const onProject = vi.fn();
    vi.mocked(api.updateItem).mockResolvedValue({ ...p, items: [{ ...p.items[0], quantity: 5 }] });
    render(<Cart project={p} onProject={onProject} onError={vi.fn()} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('A', 'A-item', { quantity: 5 }));
    expect(onProject).toHaveBeenCalled();
  });
  it('does not show project A generation results after switching to project B', async () => {
    const a = project('A'),
      b = project('B');
    const result: GenerationResult = {
      outputFile: 'A/A-only.xlsx',
      reportFile: 'A/report.json',
      report: {
        generatedAt: '2026-10-21T10:00:00Z',
        projectId: 'A',
        reference: 'REVIEW-A',
        templateWorkbook: record.workbook,
        outputFile: 'A/A-only.xlsx',
        errorCellsTotal: 0,
        errorCellsBySheet: [],
        status: 'requires_review',
        engine: 'ooxml',
        summary: 'A project only report',
        recalculation: { performed: false, method: 'none', detail: 'test' },
        sheetsCopied: ['6'],
        sheetsModified: [],
        externalLinks: [],
        items: [],
        checks: [],
        totals: { elencoCostiTotal: null, sumOfItems: null, historicalEstimate: 2181.4 },
      },
    };
    vi.mocked(api.generate).mockResolvedValue(result);
    vi.mocked(api.project).mockResolvedValue(a);
    const props = { onProject: vi.fn(), onError: vi.fn() };
    const view = render(<Cart project={a} {...props} />);
    const btn = screen.getByRole('button', { name: 'Generate Excel Analysis' });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(btn);
    });
    await screen.findByText('A project only report');
    await act(async () => {
      view.rerender(<Cart project={b} {...props} />);
    });
    expect(screen.queryByText('A project only report')).toBeNull();
    expect(screen.queryByText(/Download A-only.xlsx/)).toBeNull();
  });
  it('keeps similar results associated with the active analysis when responses arrive out of order', async () => {
    const a = deferred<SearchHit[]>(),
      b = deferred<SearchHit[]>();
    vi.mocked(api.similar).mockImplementation((id) => (id === record.id ? a.promise : b.promise));
    render(<ProductSearch {...searchProps()} />);
    fireEvent.click(await screen.findByText(record.title!));
    fireEvent.click(screen.getByText('Other selected analysis'));
    await act(async () => {
      b.resolve([hit({ ...other, id: 'B-SIM', title: 'B matching reference' })]);
    });
    await screen.findByText('B matching reference', { exact: false });
    await act(async () => {
      a.resolve([hit({ ...record, id: 'A-SIM', title: 'A stale reference' })]);
    });
    expect(screen.queryByText('A stale reference', { exact: false })).toBeNull();
    expect(screen.queryByText('B matching reference', { exact: false })).toBeTruthy();
  });
});

describe('project mutation consistency', () => {
  it('refreshes the project list after a metadata save', async () => {
    const p = project('A');
    const onChanged = vi.fn();
    vi.mocked(api.updateProject).mockResolvedValue({ ...p, name: 'Saved name' });
    render(
      <ProjectSetup
        facets={facets}
        projects={[p]}
        current={p}
        onSelect={vi.fn()}
        onChanged={onChanged}
        onError={vi.fn()}
      />,
    );
    const name = screen.getByLabelText('Project name');
    fireEvent.change(name, { target: { value: 'Saved name' } });
    fireEvent.blur(name);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
  it('ignores old validation results after the project changes', async () => {
    const a = deferred<Awaited<ReturnType<typeof api.validation>>>(),
      b = deferred<Awaited<ReturnType<typeof api.validation>>>();
    vi.mocked(api.validation).mockImplementation((id) => (id === 'A' ? a.promise : b.promise));
    const props = { onProject: vi.fn(), onError: vi.fn() };
    const view = render(<Cart project={project('A')} {...props} />);
    view.rerender(<Cart project={project('B')} {...props} />);
    await act(async () =>
      b.resolve({
        ok: false,
        issues: [{ level: 'error', message: 'B needs a reference' }],
        estimatedTotal: 0,
        itemsWithoutCost: 0,
      }),
    );
    await act(async () => a.resolve({ ok: true, issues: [], estimatedTotal: 100, itemsWithoutCost: 0 }));
    expect((screen.getByRole('button', { name: 'Generate Excel Analysis' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('B needs a reference')).toBeTruthy();
  });
  it('reconciles a created cart item when the customization request fails', async () => {
    const empty = { ...project('A'), items: [] };
    const persisted = project('A');
    persisted.items[0].params = record.params
      .filter((p) => p.editable)
      .map((p) => ({ cell: p.cell, label: p.label, unit: p.unit, value: p.value, original: p.value }));
    vi.mocked(api.me).mockResolvedValue({ id: 'u1', name: 'Tester', email: 'review@example.test', role: 'estimator' });
    vi.mocked(api.facets).mockResolvedValue(facets);
    vi.mocked(api.projects).mockResolvedValue([empty]);
    vi.mocked(api.addItem).mockResolvedValue(persisted);
    vi.mocked(api.updateItem).mockRejectedValue(new Error('Customization rejected'));
    vi.mocked(api.project).mockResolvedValue(persisted);
    render(<App />);
    const projectOption = await screen.findByRole('option', { name: /Review A/ });
    fireEvent.change(projectOption.parentElement!, { target: { value: 'A' } });
    fireEvent.click(await screen.findByText(record.title!));
    fireEvent.change(screen.getByLabelText(/cell N4/), { target: { value: '1700' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await screen.findByText('Customization rejected');
    fireEvent.click(screen.getByRole('tab',{name:'Cart & Excel export'}));
    expect(screen.getByDisplayValue('01-01')).toBeTruthy();
    expect(api.project).toHaveBeenCalledWith('A');
  });
});

describe('request ordering', () => {
  it('does not replace a newer filter search with an older response', async () => {
    const first = deferred<Awaited<ReturnType<typeof api.search>>>(),
      second = deferred<Awaited<ReturnType<typeof api.search>>>();
    vi.mocked(api.search).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(
      <ProductSearch {...searchProps()} facets={{ ...facets, categories: [{ name: 'New category', count: 1 }] }} />,
    );
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'New category' } });
    await act(async () => second.resolve({ hits: [hit(other)], semantic: false, embeddingStatus: 'ready' }));
    await act(async () => first.resolve({ hits: [hit(record)], semantic: false, embeddingStatus: 'ready' }));
    expect(screen.queryByText(record.title!)).toBeNull();
    expect(screen.getByText(other.title!)).toBeTruthy();
  });
  it('does not restore project A after an add completes while viewing B', async () => {
    const a = { ...project('A'), items: [] },
      b = { ...project('B'), items: [] },
      saved = project('A');
    saved.items[0].params = record.params
      .filter((p) => p.editable)
      .map((p) => ({ cell: p.cell, label: p.label, unit: p.unit, value: p.value, original: p.value }));
    const addition = deferred<Project>();
    vi.mocked(api.addItem).mockReturnValue(addition.promise);
    vi.mocked(api.me).mockResolvedValue({ id: 'u1', name: 'Tester', email: 'review@example.test', role: 'estimator' });
    vi.mocked(api.facets).mockResolvedValue(facets);
    vi.mocked(api.projects).mockResolvedValue([a, b]);
    render(<App />);
    await screen.findByRole('option', { name: /Review A/ });
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'A' } });
    fireEvent.click(await screen.findByText(record.title!));
    await screen.findByText('Similar reference', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    fireEvent.change(select, { target: { value: 'B' } });
    await act(async () => addition.resolve(saved));
    expect((select as HTMLSelectElement).value).toBe('B');
  });
});
