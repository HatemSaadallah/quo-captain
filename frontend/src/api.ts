/** Typed client for the NestJS backend. Types are shared with the backend (type-only imports). */
import type { AuthUser, LoginResponse } from '../../backend/src/common/interfaces/auth.interface';
import type { CatalogFacets, CatalogRecord, SearchHit, SearchResult } from '../../backend/src/common/interfaces/catalog.interface';
import type { ExcelStatus, GenerationResult, ValidationReport } from '../../backend/src/common/interfaces/generation.interface';
import type { AddItemDto, AddRowDto, CreateProjectDto, ElencoCosti, Project, ProjectValidation, UpdateItemDto, UpdateProjectDto } from '../../backend/src/common/interfaces/project.interface';

export type { AuthUser, CatalogFacets, CatalogRecord, SearchHit, SearchResult, ExcelStatus, GenerationResult, ValidationReport, Project, ProjectValidation, AddItemDto, AddRowDto, ElencoCosti, UpdateItemDto };
export type ProjectItem = Project['items'][number];

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
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
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
  search: (q: string, opts: { workbook?: string; category?: string; limit?: number } = {}): Promise<SearchResult> => {
    const p = new URLSearchParams({ q, limit: String(opts.limit ?? 30) });
    if (opts.workbook) p.set('workbook', opts.workbook);
    if (opts.category) p.set('category', opts.category);
    return request(`/api/catalog/search?${p.toString()}`);
  },
  record: (id: string): Promise<CatalogRecord> => request(`/api/catalog/${enc(id)}`),
  similar: (id: string, limit = 6): Promise<SearchHit[]> => request(`/api/catalog/${enc(id)}/similar?limit=${limit}`),

  projects: (): Promise<Project[]> => request('/api/projects'),
  project: (id: string): Promise<Project> => request(`/api/projects/${enc(id)}`),
  createProject: (dto: CreateProjectDto): Promise<Project> => request('/api/projects', { method: 'POST', ...json(dto) }),
  updateProject: (id: string, dto: UpdateProjectDto): Promise<Project> => request(`/api/projects/${enc(id)}`, { method: 'PATCH', ...json(dto) }),
  deleteProject: (id: string): Promise<{ ok: true }> => request(`/api/projects/${enc(id)}`, { method: 'DELETE' }),
  validation: (id: string): Promise<ProjectValidation> => request(`/api/projects/${enc(id)}/validation`),
  addItem: (id: string, dto: AddItemDto): Promise<Project> => request(`/api/projects/${enc(id)}/items`, { method: 'POST', ...json(dto) }),
  updateItem: (id: string, itemId: string, dto: UpdateItemDto): Promise<Project> => request(`/api/projects/${enc(id)}/items/${enc(itemId)}`, { method: 'PATCH', ...json(dto) }),
  removeItem: (id: string, itemId: string): Promise<Project> => request(`/api/projects/${enc(id)}/items/${enc(itemId)}`, { method: 'DELETE' }),
  elencoCosti: (id: string): Promise<ElencoCosti> => request(`/api/projects/${enc(id)}/elenco-costi`),
  addRow: (id: string, dto: AddRowDto): Promise<Project> => request(`/api/projects/${enc(id)}/rows`, { method: 'POST', ...json(dto) }),
  suggestions: (id: string, itemId: string, limit = 6): Promise<SearchHit[]> => request(`/api/projects/${enc(id)}/items/${enc(itemId)}/suggestions?limit=${limit}`),
  attach: (id: string, itemId: string, referenceTabId: string, overwrite = false): Promise<Project> => request(`/api/projects/${enc(id)}/items/${enc(itemId)}/attach`, { method: 'POST', ...json(overwrite ? { referenceTabId, overwrite } : { referenceTabId }) }),
  detach: (id: string, itemId: string): Promise<Project> => request(`/api/projects/${enc(id)}/items/${enc(itemId)}/attach`, { method: 'DELETE' }),

  generate: (id: string): Promise<GenerationResult> => request(`/api/projects/${enc(id)}/generate`, { method: 'POST' }),
  excelStatus: (refresh = false): Promise<ExcelStatus> => request(`/api/generation/excel-status${refresh ? '?refresh=1' : ''}`),
  outputUrl: (relativeFile: string): string => `/api/outputs/${relativeFile.split('/').map(enc).join('/')}`,
  /** Downloads a generated file with the bearer token (plain links cannot carry the header). */
  download: async (relativeFile: string): Promise<void> => {
    const res = await fetch(api.outputUrl(relativeFile), { headers: headers() });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`, null);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = relativeFile.split('/').pop() ?? 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const fmtMoney = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }));
export const fmtNum = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: digits }));
