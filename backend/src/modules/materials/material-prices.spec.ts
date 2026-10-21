import { describe, expect, it, vi, afterEach } from 'vitest';
import { estimatePoints, MaterialPricesService, rangeStart } from './material-prices.service';
import type { PrismaService } from '../prisma/prisma.service';

const observations = [
  { date: '2026-01-31', value: 100, preliminary: false },
  { date: '2026-02-28', value: 120, preliminary: true },
];
afterEach(() => vi.unstubAllGlobals());

describe('material market estimates', () => {
  it('interpolates between real monthly values and holds later dates without inventing volatility', () => {
    const points = estimatePoints(observations, 6, new Date('2026-02-14'), new Date('2026-03-03'));
    expect(points[0]).toEqual({ date: '2026-02-14', index: 110, price: 5.5, method: 'interpolated' });
    expect(points.find((point) => point.date === '2026-02-28')).toEqual({ date: '2026-02-28', index: 120, price: 6, method: 'monthly' });
    expect(points.at(-1)).toEqual({ date: '2026-03-03', index: 120, price: 6, method: 'carried' });
  });
  it('does not invent values before the source history starts', () => {
    expect(estimatePoints(observations, 6, new Date('2026-01-01'), new Date('2026-01-20'))).toEqual([]);
  });
  it('clamps calendar months and leap years correctly', () => {
    expect(rangeStart(new Date('2026-03-31'), '1m').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(rangeStart(new Date('2024-02-29'), '1y').toISOString().slice(0, 10)).toBe('2023-02-28');
    expect(rangeStart(new Date('2026-03-31'), '15d').toISOString().slice(0, 10)).toBe('2026-03-16');
  });
  it('rejects invalid ranges and unknown materials', async () => {
    const prisma = { rawMaterial: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new MaterialPricesService(prisma as unknown as PrismaService);
    await expect(service.history('missing', '2y')).rejects.toThrow('Range must');
    await expect(service.history('missing')).rejects.toThrow('Material not found');
  });
  it('fails explicitly when the provider is unavailable, without replacing data with mock history', async () => {
    const series = { id: 'WPU071', fetchedAt: null };
    const prisma = { rawMaterial: { findUnique: vi.fn().mockResolvedValue({ marketSeries: series }) }, marketSeries: { findMany: vi.fn().mockResolvedValue([series]) } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(new MaterialPricesService(prisma as unknown as PrismaService).history('G')).rejects.toThrow('BLS returned 503');
  });
  it('validates every series before persisting a provider response', async () => {
    const series = { id: 'WPU071', fetchedAt: null };
    const prisma = { rawMaterial: { findUnique: vi.fn().mockResolvedValue({ marketSeries: series }) }, marketSeries: { findMany: vi.fn().mockResolvedValue([series]) }, $transaction: vi.fn() };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ seriesID: 'WPU071', data: [{ year: '2026', period: 'M13', value: '240', footnotes: [] }] }] } }) }));
    await expect(new MaterialPricesService(prisma as unknown as PrismaService).history('G')).rejects.toThrow('insufficient observations');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
