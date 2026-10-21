import { useEffect, useState } from 'react';
import { api, fmtNum, type MaterialPriceHistory, type MaterialPriceRange } from '../api';

const ranges: Array<[MaterialPriceRange, string]> = [['15d', '15 days'], ['1m', '1 month'], ['6m', '6 months'], ['1y', '1 year']];
const dateLabel = (date: string): string => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function MaterialPriceChart({ materialId }: { materialId: string }) {
  const [range, setRange] = useState<MaterialPriceRange>('6m');
  const [data, setData] = useState<MaterialPriceHistory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setData(null); setHover(null);
    api.materialPrices(materialId, range).then((result) => { if (live) setData(result); })
      .catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [materialId, range, retry]);
  const points = data?.points ?? [];
  const values = points.map((point) => point.index);
  const min = Math.min(...values); const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.18, Math.abs(max) * 0.005, 0.01);
  const low = min - padding; const high = max + padding;
  const x = (index: number): number => 82 + index / Math.max(1, points.length - 1) * 868;
  const y = (value: number): number => 246 - (value - low) / (high - low) * 210;
  const selected = hover === null ? points.length - 1 : hover;
  const active = points[selected];
  const change = values.length > 1 && values[0] > 0 ? (values[values.length - 1] / values[0] - 1) * 100 : null;
  const format = (value: number): string => fmtNum(value, 3);
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`).join(' ');
  const firstCarried = points.findIndex((point) => point.method === 'carried');
  return <section className="inventory-card market-card" aria-label="Material price history">
    <div className="market-heading"><div><div className="inventory-eyebrow">Market intelligence</div><h2>Material price trend</h2><p className="muted">Published monthly price index, in its original units.</p></div><div className="market-ranges" role="group" aria-label="Price history range">{ranges.map(([key, label]) => <button key={key} aria-pressed={range === key} onClick={() => setRange(key)}>{label}</button>)}</div></div>
    <div className="market-controls"><span className="inventory-badge historical">Monthly observations</span></div>
    {loading && <div className="market-loading" role="status">Loading published market data…</div>}
    {error && <div className="inventory-empty" role="alert"><strong>Market data unavailable</strong><span>{error}</span><button onClick={() => setRetry(retry + 1)}>Retry</button></div>}
    {data && <>
      <div className="market-stats"><div><span>{active ? dateLabel(active.date) : 'No observations'}</span><strong>{active ? format(active.index) : '—'} <small>{data.series.units}</small></strong><span>{active?.method === 'carried' ? 'Latest monthly level held constant' : active?.method === 'interpolated' ? 'Interpolated between monthly observations' : 'Published monthly observation'}</span></div><div><span>Change in selected period</span><strong className={change !== null && change < 0 ? 'market-down' : 'market-up'}>{change === null ? '—' : `${change > 0 ? '+' : ''}${fmtNum(change, 2)}%`}</strong><span>{dateLabel(data.start)} – {dateLabel(data.end)}</span></div></div>
      {points.length > 0 ? <div className="market-chart"><svg viewBox="0 0 980 300" role="img" aria-label={`${data.series.title}: price index, ${dateLabel(data.start)} to ${dateLabel(data.end)}`} onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const relative = (event.clientX - bounds.left) / bounds.width * 980; setHover(Math.max(0, Math.min(points.length - 1, Math.round((relative - 82) / 868 * (points.length - 1))))); }} onPointerLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((tick) => { const value = low + (high - low) * tick / 4; return <g key={tick}><line x1="82" x2="950" y1={y(value)} y2={y(value)} className="market-grid" /><text x="70" y={y(value) + 4} textAnchor="end">{format(value)}</text></g>; })}
        {firstCarried >= 0 && <rect x={x(firstCarried)} y="30" width={950 - x(firstCarried)} height="216" className="market-unpublished" />}
        <path d={`${path} L950,246 L82,246 Z`} className="market-area" />
        <path d={path} className="market-line" />
        {points.map((point, index) => point.method === 'monthly' ? <circle key={point.date} cx={x(index)} cy={y(values[index])} r="4" className="market-dot"><title>{dateLabel(point.date)}: {format(values[index])}</title></circle> : null)}
        {active && <g><line x1={x(selected)} x2={x(selected)} y1="30" y2="246" className="market-cursor" /><circle cx={x(selected)} cy={y(values[selected])} r="5" className="market-dot" /></g>}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((index, key) => <text key={key} x={x(index)} y="280" textAnchor={key === 0 ? 'start' : key === 2 ? 'end' : 'middle'}>{dateLabel(points[index].date)}</text>)}
      </svg></div> : <div className="inventory-empty">No published observations cover this period.</div>}
      {data.observations.length === 0 && <p className="market-notice">No new monthly observation falls within this window. The flat line holds the last published level; daily price movements are unknown.</p>}
      <div className="market-provenance"><div><strong>Source: US Bureau of Labor Statistics</strong><a href={data.series.sourceUrl} target="_blank" rel="noreferrer">{data.series.title} · {data.series.id} ↗</a><span>{data.series.units} · Monthly · Latest period: {dateLabel(data.series.latestPeriod)} · Retrieved: {dateLabel(data.series.fetchedAt.slice(0, 10))}</span></div><p>{data.series.note}</p><p>Dots are published monthly observations; connecting daily values are interpolated. The shaded period holds the latest value. Index points are not EUR prices. Monthly values are shown at period end and may be revised.</p><details><summary>View published observations ({data.observations.length})</summary><div className="table-scroll"><table className="inventory-table"><thead><tr><th>Month</th><th className="inventory-number">Published index</th><th>Status</th></tr></thead><tbody>{data.observations.map((point) => <tr key={point.date}><td>{dateLabel(point.date)}</td><td className="inventory-number">{fmtNum(point.value, 3)}</td><td>{point.preliminary ? 'Preliminary' : 'Subject to revision'}</td></tr>)}</tbody></table></div></details></div>
    </>}
  </section>;
}
