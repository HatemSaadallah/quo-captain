import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Project } from '../../common/interfaces/project.interface';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import type { PrismaService } from '../prisma/prisma.service';
import type { ProjectsService } from './projects.service';
import { ProjectIntelligenceService } from './project-intelligence.service';
import { previewChat, previewSearch } from './project-preview';

const project = (over: Partial<Project> = {}): Project => ({ id: 'p1', name: 'Nave 17', customer: 'OMNIX', customerId: 'c1', brief: 'Keep the glass balcony.', contacts: [], createdAt: '', updatedAt: '2026-10-01', quotations: [{ id: 'q1', name: 'Suite balconies', reference: 'TM2123-02', date: '2026-10-01', updatedAt: '2026-10-01T00:00:00.000Z', items: [{ id: 'balcony', description: 'Glass balcony items', quantity: 4, unit: 'pcs' }, { id: 'jacuzzi', description: 'Windscreen for jacuzzi', quantity: 1, unit: 'pcs' }] } as Project['quotations'][number]], ...over });
const user = { id: 'u1', name: 'Salesperson', role: 'salesperson' } as AuthUser;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('project MVP preview', () => {
  it('understands misspelled jacuzzi and proposes exact record exclusions', () => {
    const result = previewChat('same thing but without jaccuzzi items', 'p1', [project()]);
    expect(result.sourceQuotationId).toBe('q1');
    expect(result.excludeItemIds).toEqual(['jacuzzi']);
    expect(result.reply).toContain('keeps 1 items');
  });
  it('does not invent missing products or remove all rows', () => {
    expect(previewChat('same without swimming pool', 'p1', [project()]).sourceQuotationId).toBeNull();
    expect(previewChat('same without glass jacuzzi', 'p1', [project()]).sourceQuotationId).toBeNull();
  });
  it('restricts customer matches and searches item synonyms', () => {
    const other = project({ id: 'p2', customer: 'APEXA', customerId: 'c2' });
    expect(previewSearch('Find the last glazing project for OMNIX', [project(), other]).projectIds).toEqual(['p1']);
    expect(previewSearch('Find rocket engines', [project(), other]).projectIds).toEqual([]);
  });
});

describe('project intelligence boundaries', () => {
  it('accepts only owned project IDs returned by the LLM', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Found the balcony project.', projectIds: ['other-owner-project', 'p1', 'p1'] }) } }] }) }));
    const projects = { list: vi.fn().mockResolvedValue([project()]) };
    const service = new ProjectIntelligenceService({} as PrismaService, projects as unknown as ProjectsService);
    expect(await service.search('balconies', 'u1')).toEqual({ reply: 'Found the balcony project.', projectIds: ['p1'], mode: 'llm' });
    expect(projects.list).toHaveBeenCalledWith('u1');
  });
  it('labels provider-limit responses as preview and avoids repeatedly calling a failing provider', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only');
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429 }); vi.stubGlobal('fetch', fetcher);
    const service = new ProjectIntelligenceService({} as PrismaService, { list: async () => [project()] } as unknown as ProjectsService);
    expect((await service.search('OMNIX balcony', 'u1')).mode).toBe('preview');
    expect((await service.search('OMNIX balcony', 'u1')).mode).toBe('preview');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('checks project ownership before reading or writing transcript data', async () => {
    const prisma = { projectMessage: { findMany: vi.fn(), create: vi.fn() } };
    const projects = { getOwned: vi.fn().mockRejectedValue(new NotFoundException('Project not found')) };
    const service = new ProjectIntelligenceService(prisma as unknown as PrismaService, projects as unknown as ProjectsService);
    await expect(service.transcript('someone-elses-project', 'u1')).rejects.toThrow('Project not found');
    await expect(service.chat('someone-elses-project', 'without jacuzzi', user)).rejects.toThrow('Project not found');
    expect(prisma.projectMessage.findMany).not.toHaveBeenCalled();
  });
  it('rejects hallucinated exclusion IDs instead of persisting an invalid proposal', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-only');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Exclude it.', sourceQuotationId: 'q1', title: 'Revision', excludeItemIds: ['invented'] }) } }] }) }));
    const prisma = { projectMessage: { findMany: vi.fn().mockResolvedValue([]) }, $transaction: vi.fn() };
    const projects = { getOwned: async () => ({ customerId: 'c1' }), list: async () => [project()] };
    const service = new ProjectIntelligenceService(prisma as unknown as PrismaService, projects as unknown as ProjectsService);
    await expect(service.chat('p1', 'same without jacuzzi', user)).rejects.toThrow('did not match');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a stale source quotation before creating a draft', async () => {
    const tx = { projectMessage: { findFirst: async () => ({ proposal: { sourceQuotationId: 'q1', sourceUpdatedAt: 'old', excludeItemIds: ['jacuzzi'] } }) }, quotation: { findFirst: async () => ({ updatedAt: new Date(), items: [] }), create: vi.fn() } };
    const prisma = { $transaction: (run: (db: unknown) => unknown) => run(tx) };
    const projects = { getOwned: async () => ({ customerId: 'c1', customer: { name: 'OMNIX' } }) };
    await expect(new ProjectIntelligenceService(prisma as unknown as PrismaService, projects as unknown as ProjectsService).createDraft('p1', 'm1', { name: 'New draft', reference: 'TM1' }, user)).rejects.toThrow('source quotation changed');
    expect(tx.quotation.create).not.toHaveBeenCalled();
  });
});
