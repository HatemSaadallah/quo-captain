import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, type Benchmark as BenchmarkData } from '../api';

interface Props {
  quotationId: string;
  itemId: string;
  onError: (msg: string) => void;
}

/** Historical benchmarking next to the row being edited: comparable analyses, their specs, dates, sources and category costs. */
export function Benchmark({ quotationId, itemId, onError }: Props) {
  const [data, setData] = useState<BenchmarkData | null>(null);
  useEffect(() => {
    setData(null);
    api
      .benchmark(quotationId, itemId)
      .then((b) => {
        if (b.itemId === itemId) setData(b);
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  }, [quotationId, itemId, onError]);

  if (!data) return <div className="muted small">loading comparable analyses…</div>;
  const own = data.stats.own;
  return (
    <div className="benchmark">
      <h3>Historical benchmark · comparable analyses for "{data.query}"</h3>
      <div className="row small" style={{ gap: 16 }}>
        <span>
          this row: <b>{fmtMoney(own)}</b> / {data.stats.unit}
        </span>
        <span>
          comparables: min {fmtMoney(data.stats.min)} · median {fmtMoney(data.stats.median)} · max {fmtMoney(data.stats.max)}
        </span>
        {own !== null && data.stats.median !== null && <span className={`badge ${Math.abs(own - data.stats.median) / data.stats.median > 0.25 ? 'warn' : 'ok'}`}>{own > data.stats.median ? '+' : ''}{(((own - data.stats.median) / data.stats.median) * 100).toFixed(0)}% vs median</span>}
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Similarity</th>
            <th>Analysis</th>
            <th>Source</th>
            <th>Client · date</th>
            <th className="num">Q.ty</th>
            <th className="num">L × H</th>
            <th>Parameters</th>
            <th className="num">Unit cost</th>
          </tr>
        </thead>
        <tbody>
          {data.examples.map((e) => (
            <tr key={e.id}>
              <td>{Math.round(e.similarity * 100)}%</td>
              <td>
                {e.title}
                <div className="small muted">item {e.itemCode}</div>
              </td>
              <td className="small">
                <span className="chip">{e.offerNo ?? e.workbook}</span> sheet {e.sheet}
                <div className="muted">{e.sourceCell}</div>
              </td>
              <td className="small">
                {e.client} · {e.projectDate}
              </td>
              <td className="num">
                {fmtNum(e.quantity, 2)} {e.unit}
              </td>
              <td className="num">
                {fmtNum(e.L)} × {fmtNum(e.H)}
              </td>
              <td className="small">{e.params.map((p) => `${p.label} ${p.value ?? ''}${p.unit ? ' ' + p.unit : ''}`).join(' · ')}</td>
              <td className="num">
                <b>{fmtMoney(e.unitCost)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.categories.length > 0 && (
        <details className="small">
          <summary>Cost components per unit: this row vs comparables ({data.categories.length} categories)</summary>
          <table className="data">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">this row</th>
                {data.examples.map((e) => (
                  <th key={e.id} className="num" title={e.title ?? ''}>
                    {e.offerNo ?? e.workbook}/{e.sheet}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.code}>
                  <td>
                    {c.category} <span className="muted">({c.code})</span>
                  </td>
                  <td className="num">
                    <b>{fmtMoney(c.own)}</b>
                  </td>
                  {c.comparables.map((v, i) => (
                    <td key={i} className="num" style={v !== null && c.own !== null && v !== 0 ? { color: c.own > v * 1.25 ? 'var(--err)' : c.own < v * 0.75 ? 'var(--ok)' : undefined } : undefined}>
                      {fmtMoney(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <div className="small muted">
        Similar quotations: {data.quotations.map((p) => `${p.offerNo ?? p.workbook} (${p.client}, ${p.projectName}, ${p.projectDate}; ${p.matches} match${p.matches > 1 ? 'es' : ''})`).join(' · ')}
      </div>
    </div>
  );
}
