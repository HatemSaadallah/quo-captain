import { useState } from 'react';

type Cell = string | number | null;
export interface ChartData {
  columns: string[];
  rows: Array<Record<string, Cell>>;
  query: string;
  chart: 'bar' | 'line' | 'pie' | 'histogram' | null;
}

/** Validated categorical palette (scripts/validate_palette.js, light mode): fixed order, never cycled past 6. */
const SERIES = ['#00939b', '#eb6834', '#2a78d6', '#eda100', '#e87ba4', '#008300'];
const OTHER = '#b8c3c6';

const pretty = (col: string): string => col.replace(/^(sum|avg|min|max)_/, (m) => ({ sum_: 'Total ', avg_: 'Average ', min_: 'Min ', max_: 'Max ' })[m] ?? m).replace(/_range$/, ' range').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const isMoney = (col: string): boolean => /total|cost|price/.test(col);
const fmt = (v: number, money: boolean): string => {
  const abs = Math.abs(v);
  const n = abs >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : abs >= 1e4 ? `${Math.round(v / 1e3)}k` : abs >= 100 ? Math.round(v).toLocaleString('en-GB') : v.toLocaleString('en-GB', { maximumFractionDigits: 1 });
  return money ? `€${n}` : n;
};

/** Pick a label column and a value column from a query result; null when it cannot be charted. */
function shape(data: ChartData): { labels: string[]; values: number[]; labelCol: string; valueCol: string } | null {
  const sample = data.rows[0];
  if (!sample) return null;
  const numeric = data.columns.filter((c) => data.rows.every((r) => typeof r[c] === 'number' || r[c] === null));
  const textual = data.columns.filter((c) => !numeric.includes(c));
  const valueCol = numeric.find((c) => /^(sum|avg|count|min|max)/.test(c)) ?? numeric.find((c) => /total|cost/.test(c)) ?? numeric[0];
  if (!valueCol) return null;
  const labelCols = textual.length ? textual : numeric.filter((c) => c !== valueCol).slice(0, 1);
  if (!labelCols.length) return null;
  return {
    labels: data.rows.map((r) => labelCols.map((c) => String(r[c] ?? '—')).join(' · ')),
    values: data.rows.map((r) => Number(r[valueCol] ?? 0)),
    labelCol: labelCols.map(pretty).join(' · '),
    valueCol,
  };
}

export function InsightChart({ data }: { data: ChartData }) {
  const [hover, setHover] = useState<number | null>(null);
  const s = shape(data);
  if (!s || s.values.length < 2) return null;
  const isTime = /month|date|year/i.test(s.labelCol);
  const kind = data.chart ?? (data.columns.some((c) => c.endsWith('_range')) ? 'histogram' : isTime ? 'line' : 'bar');
  const money = isMoney(s.valueCol);
  const title = `${pretty(s.valueCol)} by ${s.labelCol.toLowerCase()}`;

  if (kind === 'pie') {
    // At most 6 slices in palette order; the rest fold into "Other".
    const order = s.values.map((v, i) => ({ v, l: s.labels[i] })).sort((a, b) => b.v - a.v);
    const slices = order.slice(0, 6);
    const rest = order.slice(6).reduce((a, b) => a + b.v, 0);
    if (rest > 0) slices.push({ v: rest, l: 'Other' });
    const total = slices.reduce((a, b) => a + b.v, 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = slices.map((sl, i) => {
      const sweep = (sl.v / total) * Math.PI * 2;
      const [x1, y1] = [90 + 80 * Math.cos(angle), 90 + 80 * Math.sin(angle)];
      angle += sweep;
      const [x2, y2] = [90 + 80 * Math.cos(angle), 90 + 80 * Math.sin(angle)];
      const d = slices.length === 1 ? 'M90 10 A80 80 0 1 1 89.99 10 Z' : `M90 90 L${x1} ${y1} A80 80 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
      return { d, color: sl.l === 'Other' ? OTHER : SERIES[i], ...sl };
    });
    return (
      <figure className="ic">
        <figcaption>{title}</figcaption>
        <div className="ic-pie">
          <svg viewBox="0 0 180 180" role="img" aria-label={title}>
            {arcs.map((a, i) => (
              <path key={a.l} d={a.d} fill={a.color} stroke="#fff" strokeWidth={2} opacity={hover === null || hover === i ? 1 : 0.45} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <title>{`${a.l}: ${fmt(a.v, money)} (${Math.round((a.v / total) * 100)}%)`}</title>
              </path>
            ))}
            <circle cx="90" cy="90" r="44" fill="#fff" />
            <text x="90" y="86" textAnchor="middle" className="ic-donut-value">
              {hover === null ? fmt(total, money) : `${Math.round((arcs[hover].v / total) * 100)}%`}
            </text>
            <text x="90" y="104" textAnchor="middle" className="ic-donut-label">
              {hover === null ? 'total' : arcs[hover].l.slice(0, 16)}
            </text>
          </svg>
          <ul className="ic-legend">
            {arcs.map((a, i) => (
              <li key={a.l} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <i style={{ background: a.color }} />
                <span>{a.l}</span>
                <b>{fmt(a.v, money)}</b>
                <small>{Math.round((a.v / total) * 100)}%</small>
              </li>
            ))}
          </ul>
        </div>
      </figure>
    );
  }

  // Bar, histogram and line share one plot frame.
  const n = Math.min(s.values.length, kind === 'line' ? 36 : 14);
  const labels = s.labels.slice(0, n);
  const values = s.values.slice(0, n);
  const W = 640;
  const H = 230;
  const pad = { l: 56, r: 12, t: 16, b: 46 };
  const max = Math.max(...values, 0) || 1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const y = (v: number): number => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const band = (W - pad.l - pad.r) / n;
  const x = (i: number): number => pad.l + band * i + band / 2;
  const ticks = [0, 0.5, 1].map((t) => min + span * t);
  const color = SERIES[0];
  const step = Math.ceil(n / 8);

  return (
    <figure className="ic">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="ic-plot" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="ic-grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="ic-axis">
              {fmt(t, money)}
            </text>
          </g>
        ))}
        {kind === 'line' ? (
          <>
            <path d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
            <path d={`${values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ')} L${x(n - 1)} ${y(min)} L${x(0)} ${y(min)} Z`} fill={color} opacity={0.08} />
            {values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill="#fff" stroke={color} strokeWidth={2} />
            ))}
          </>
        ) : (
          values.map((v, i) => {
            const top = y(Math.max(v, 0));
            const h = Math.max(1, Math.abs(y(v) - y(0)));
            const w = kind === 'histogram' ? band - 2 : Math.min(48, band * 0.62);
            return <rect key={i} x={x(i) - w / 2} y={top} width={w} height={h} rx={kind === 'histogram' ? 2 : 4} fill={color} opacity={hover === null || hover === i ? 1 : 0.5} />;
          })
        )}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text key={i} x={x(i)} y={H - pad.b + 18} textAnchor="middle" className="ic-axis">
              {l.length > 12 ? `${l.slice(0, 11)}…` : l}
            </text>
          ) : null,
        )}
        {/* Hit targets wider than the marks */}
        {values.map((_, i) => (
          <rect key={`hit${i}`} x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <rect x={Math.min(Math.max(x(hover) - 80, 4), W - 164)} y={Math.max(y(values[hover]) - 46, 2)} width={160} height={38} rx={6} className="ic-tip" />
            <text x={Math.min(Math.max(x(hover), 84), W - 84)} y={Math.max(y(values[hover]) - 30, 18)} textAnchor="middle" className="ic-tip-label">
              {labels[hover].slice(0, 26)}
            </text>
            <text x={Math.min(Math.max(x(hover), 84), W - 84)} y={Math.max(y(values[hover]) - 14, 34)} textAnchor="middle" className="ic-tip-value">
              {fmt(values[hover], money)}
            </text>
          </g>
        )}
      </svg>
      {s.values.length > n && <p className="ic-note">Showing the first {n} of {s.values.length} rows.</p>}
    </figure>
  );
}
