/** Typed client for the NestJS backend. Types are shared with the backend (type-only imports). */
import type { AuthUser, LoginResponse } from '../../backend/src/common/interfaces/auth.interface';
import type { CatalogFacets, CatalogRecord, CreateCatalogProductDto, SearchHit, SearchResult } from '../../backend/src/common/interfaces/catalog.interface';
import type { ExcelStatus, GenerationResult, ValidationReport } from '../../backend/src/common/interfaces/generation.interface';
import type { AddItemDto, AddRowDto, CreateQuotationDto, ElencoCosti, Quotation, QuotationValidation, UpdateItemDto, UpdateQuotationDto } from '../../backend/src/common/interfaces/quotation.interface';
import type { CreateProjectDto, Project, ProjectContact } from '../../backend/src/common/interfaces/project.interface';
import type { Benchmark, GridCell, GridSheet, WorkbookView } from '../../backend/src/common/interfaces/workbook-view.interface';

export type { AuthUser, CatalogFacets, CatalogRecord, CreateCatalogProductDto, SearchHit, SearchResult, ExcelStatus, GenerationResult, ValidationReport, Quotation, QuotationValidation, AddItemDto, AddRowDto, CreateQuotationDto, ElencoCosti, UpdateItemDto, Benchmark, GridCell, GridSheet, WorkbookView, Project, ProjectContact, CreateProjectDto };
export type QuotationItem = Quotation['items'][number];

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const TOKEN_KEY = 'somec.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only */
  }
}

/** Called once when the backend answers 401 (expired/invalid token). */
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // plain-text error body
    }
    const msg = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : res.statusText;
    if (res.status === 401 && !url.endsWith('/auth/login')) {
      setToken(null);
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, msg, body);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const api = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const res = await request<LoginResponse>('/api/auth/login', { method: 'POST', ...json({ email, password }) });
    setToken(res.token);
    return res;
  },
  me: (): Promise<AuthUser> => request('/api/auth/me'),
  logout: (): void => setToken(null),

  facets: (): Promise<CatalogFacets> => request('/api/catalog/facets'),
  outputs: (): Promise<Array<{ folder: string; file: string; size: number; modifiedAt: string }>> => request('/api/outputs'),
  assistantChat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, contacts: unknown[]): Promise<{ reply: string }> => request('/api/assistant/chat', { method: 'POST', ...json({ messages, contacts }) }),
  customProducts: (): Promise<CatalogRecord[]> => request('/api/catalog/custom'),
  createCatalogProduct: (dto: CreateCatalogProductDto): Promise<CatalogRecord> => request('/api/catalog', { method: 'POST', ...json(dto) }),
  search: (q: string, opts: { workbook?: string; category?: string; limit?: number } = {}): Promise<SearchResult> => {
    const p = new URLSearchParams({ q, limit: String(opts.limit ?? 30) });
    if (opts.workbook) p.set('workbook', opts.workbook);
    if (opts.category) p.set('category', opts.category);
    return request(`/api/catalog/search?${p.toString()}`);
  },
  record: (id: string): Promise<CatalogRecord> => request(`/api/catalog/${enc(id)}`),
  similar: (id: string, limit = 6): Promise<SearchHit[]> => request(`/api/catalog/${enc(id)}/similar?limit=${limit}`),

  projects: (): Promise<Project[]> => request('/api/projects'),
  projectContacts: (): Promise<Project['contacts']> => request('/api/projects/contacts'),
  createProject: (dto: CreateProjectDto): Promise<Project> => request('/api/projects', { method: 'POST', ...json(dto) }),

  quotations: (): Promise<Quotation[]> => request('/api/quotations'),
  quotation: (id: string): Promise<Quotation> => request(`/api/quotations/${enc(id)}`),
  createQuotation: (dto: CreateQuotationDto): Promise<Quotation> => request('/api/quotations', { method: 'POST', ...json(dto) }),
  updateQuotation: (id: string, dto: UpdateQuotationDto): Promise<Quotation> => request(`/api/quotations/${enc(id)}`, { method: 'PATCH', ...json(dto) }),
  deleteQuotation: (id: string): Promise<{ ok: true }> => request(`/api/quotations/${enc(id)}`, { method: 'DELETE' }),
  validation: (id: string): Promise<QuotationValidation> => request(`/api/quotations/${enc(id)}/validation`),
  addItem: (id: string, dto: AddItemDto): Promise<Quotation> => request(`/api/quotations/${enc(id)}/items`, { method: 'POST', ...json(dto) }),
  updateItem: (id: string, itemId: string, dto: UpdateItemDto): Promise<Quotation> => request(`/api/quotations/${enc(id)}/items/${enc(itemId)}`, { method: 'PATCH', ...json(dto) }),
  removeItem: (id: string, itemId: string): Promise<Quotation> => request(`/api/quotations/${enc(id)}/items/${enc(itemId)}`, { method: 'DELETE' }),
  elencoCosti: (id: string): Promise<ElencoCosti> => request(`/api/quotations/${enc(id)}/elenco-costi`),
  workbook: (id: string): Promise<WorkbookView> => request(`/api/quotations/${enc(id)}/workbook`),
  benchmark: (id: string, itemId: string, limit = 6): Promise<Benchmark> => request(`/api/quotations/${enc(id)}/items/${enc(itemId)}/benchmark?limit=${limit}`),
  /** Downloads the ELENCO COSTI as PDF (bearer token, blob). */
  downloadPdf: async (id: string, reference: string): Promise<void> => {
    const res = await fetch(`/api/quotations/${enc(id)}/elenco-costi.pdf`, { headers: headers() });
    if (!res.ok) throw new ApiError(res.status, `PDF export failed (${res.status})`, null);
    saveBlob(await res.blob(), `${reference || 'quotation'} ELENCO COSTI.pdf`);
  },
  addRow: (id: string, dto: AddRowDto): Promise<Quotation> => request(`/api/quotations/${enc(id)}/rows`, { method: 'POST', ...json(dto) }),
  suggestions: (id: string, itemId: string, limit = 6): Promise<SearchHit[]> => request(`/api/quotations/${enc(id)}/items/${enc(itemId)}/suggestions?limit=${limit}`),
  attach: (id: string, itemId: string, referenceTabId: string, overwrite = false): Promise<Quotation> => request(`/api/quotations/${enc(id)}/items/${enc(itemId)}/attach`, { method: 'POST', ...json(overwrite ? { referenceTabId, overwrite } : { referenceTabId }) }),
  detach: (id: string, itemId: string): Promise<Quotation> => request(`/api/quotations/${enc(id)}/items/${enc(itemId)}/attach`, { method: 'DELETE' }),

  generate: (id: string): Promise<GenerationResult> => request(`/api/quotations/${enc(id)}/generate`, { method: 'POST' }),
  excelStatus: (refresh = false): Promise<ExcelStatus> => request(`/api/generation/excel-status${refresh ? '?refresh=1' : ''}`),
  outputUrl: (relativeFile: string): string => `/api/outputs/${relativeFile.split('/').map(enc).join('/')}`,
  /** Downloads a generated file with the bearer token (plain links cannot carry the header). */
  download: async (relativeFile: string): Promise<void> => {
    const res = await fetch(api.outputUrl(relativeFile), { headers: headers() });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`, null);
    saveBlob(await res.blob(), relativeFile.split('/').pop() ?? 'download');
  },
};

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const fmtMoney = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }));
export const fmtNum = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: digits }));
