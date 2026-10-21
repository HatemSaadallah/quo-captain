/** Typed client for the NestJS backend. Types are shared with the backend (type-only imports). */
import type { CatalogFacets, CatalogRecord, SearchHit, SearchResult } from '../../backend/src/common/interfaces/catalog.interface';
import type { ExcelStatus, GenerationResult, ValidationReport } from '../../backend/src/common/interfaces/generation.interface';
import type { AddItemDto, CreateProjectDto, Project, ProjectValidation, UpdateItemDto, UpdateProjectDto } from '../../backend/src/common/interfaces/project.interface';

export type { CatalogFacets, CatalogRecord, SearchHit, SearchResult, ExcelStatus, GenerationResult, ValidationReport, Project, ProjectValidation, AddItemDto, UpdateItemDto };
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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const msg = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : res.statusText;
    throw new ApiError(res.status, msg, body);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const enc = encodeURIComponent;

export const api = {
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

  generate: (id: string): Promise<GenerationResult> => request(`/api/projects/${enc(id)}/generate`, { method: 'POST' }),
  excelStatus: (refresh = false): Promise<ExcelStatus> => request(`/api/generation/excel-status${refresh ? '?refresh=1' : ''}`),
  downloadUrl: (relativeFile: string): string => `/api/outputs/${relativeFile.split('/').map(enc).join('/')}`,
};

export const fmtMoney = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }));
export const fmtNum = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: digits }));
