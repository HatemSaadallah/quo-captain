import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MarketObservation, MaterialPriceHistory, MaterialPriceRange } from '../../common/interfaces/material.interface';
import { PrismaService } from '../prisma/prisma.service';

export function rangeStart(end: Date, range: MaterialPriceRange): Date {
  const start = new Date(end);
  if (range === '15d') start.setUTCDate(start.getUTCDate() - 15);
  else {
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - (range === '1m' ? 1 : range === '6m' ? 6 : 12));
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, last));
  }
  return start;
}

// Monthly averages are positioned at period end, never presented as daily source quotes.
export function estimatePoints(observations: MarketObservation[], basePrice: number, start: Date, end: Date): MaterialPriceHistory['points'] {
  if (!observations.length) return [];
  const anchors = observations.map((point) => ({ ...point, time: Date.parse(point.date) }));
  const latest = anchors[anchors.length - 1].value;
  const result: MaterialPriceHistory['points'] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
    if (time < anchors[0].time) continue;
    const right = anchors.findIndex((point) => point.time >= time);
    let index: number;
    let method: 'interpolated' | 'carried' | 'monthly';
    if (right < 0) { index = latest; method = 'carried'; }
    else if (anchors[right].time === time) { index = anchors[right].value; method = 'monthly'; }
    else {
      const before = anchors[right - 1];
      const after = anchors[right];
      index = before.value + (after.value - before.value) * (time - before.time) / (after.time - before.time);
      method = 'interpolated';
    }
    result.push({ date: new Date(time).toISOString().slice(0, 10), index, price: basePrice * (index / latest), method });
  }
  return result;
}

@Injectable()
export class MaterialPricesService {
  private refreshTask: Promise<void> | null = null;
  constructor(private readonly prisma: PrismaService) {}

  private async refresh(): Promise<void> {
    if (this.refreshTask) return this.refreshTask;
    this.refreshTask = this.download().finally(() => { this.refreshTask = null; });
    return this.refreshTask;
  }

  private async download(): Promise<void> {
    const series = await this.prisma.marketSeries.findMany();
    const now = new Date();
    try {
      const response = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ seriesid: series.map((item) => item.id), startyear: String(now.getUTCFullYear() - 2), endyear: String(now.getUTCFullYear()) }),
      });
      if (!response.ok) throw new Error(`BLS returned ${response.status}`);
      const body = await response.json() as { status: string; message?: string[]; Results?: { series: Array<{ seriesID: string; data: Array<{ year: string; period: string; value: string; footnotes: Array<{ code?: string }> }> }> } };
      if (body.status !== 'REQUEST_SUCCEEDED' || !body.Results) throw new Error(body.message?.join('; ') || 'Invalid BLS response');
      const updates = series.map((item) => {
        const data = body.Results!.series.find((row) => row.seriesID === item.id)?.data;
        const observations = (data ?? []).filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period) && Number.isFinite(Number(row.value)) && Number(row.value) > 0)
          .map((row) => ({ date: new Date(Date.UTC(Number(row.year), Number(row.period.slice(1)), 0)).toISOString().slice(0, 10), value: Number(row.value), preliminary: row.footnotes.some((note) => note.code === 'P') }))
          .filter((point) => point.date <= now.toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date));
        if (observations.length < 2) throw new Error(`BLS has insufficient observations for ${item.id}`);
        return { id: item.id, observations };
      });
      await this.prisma.$transaction(updates.map((item) => this.prisma.marketSeries.update({ where: { id: item.id }, data: { observations: item.observations, fetchedAt: now } })));
    } catch (error) {
      throw new BadGatewayException(`Market data could not be refreshed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async history(id: string, input = '6m'): Promise<MaterialPriceHistory> {
    if (!['15d', '1m', '6m', '1y'].includes(input)) throw new BadRequestException('Range must be 15d, 1m, 6m or 1y');
    const range = input as MaterialPriceRange;
    const material = await this.prisma.rawMaterial.findUnique({ where: { id }, include: { marketSeries: true } });
    if (!material) throw new NotFoundException('Material not found');
    let series = material.marketSeries;
    if (!series) throw new NotFoundException('This material has no configured market series');
    if (!series.fetchedAt || Date.now() - series.fetchedAt.getTime() > 86_400_000) {
      await this.refresh();
      series = await this.prisma.marketSeries.findUniqueOrThrow({ where: { id: series.id } });
    }
    const observations = series.observations as unknown as MarketObservation[];
    if (!observations.length || !series.fetchedAt) throw new BadGatewayException('Market series has no downloaded observations');
    const end = new Date(); end.setUTCHours(0, 0, 0, 0);
    const start = rangeStart(end, range);
    return {
      range, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10),
      series: { id: series.id, title: series.title, units: series.units, sourceUrl: series.sourceUrl, fetchedAt: series.fetchedAt.toISOString(), latestPeriod: observations[observations.length - 1].date, note: material.marketNote ?? '' },
      basePrice: material.unitCost, basePriceSource: material.priceSource, unit: material.unit,
      observations: observations.filter((point) => point.date >= start.toISOString().slice(0, 10) && point.date <= end.toISOString().slice(0, 10)),
      points: estimatePoints(observations, material.unitCost, start, end),
    };
  }
}
