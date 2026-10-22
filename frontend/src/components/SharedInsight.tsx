import { useEffect, useState } from 'react';
import { api, saveBlob, type SharedInsight as Snapshot } from '../api';
import { InsightChart } from './InsightChart';
import { Markdown } from './InsightsPage';
import '../insights.css';

/** Read-only report for a shared insight link: works without signing in, prints cleanly to PDF. */
export function SharedInsight({ id }: { id: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.sharedInsight(id).then(setSnap).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const csv = (): void => {
    if (!snap?.chart) return;
    const esc = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const { columns, rows } = snap.chart;
    saveBlob(new Blob([[columns.map(esc).join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n')], { type: 'text/csv' }), 'somec-insight-data.csv');
  };

  return (
    <div className="si">
      <header className="si-top">
        <span className="si-brand"><img src="/quo-captain.svg" alt="" />Quo-Captain<small>by Somec</small></span>
        <span>Insight report</span>
      </header>
      {error && <main className="si-card"><h1>Insight not available</h1><p className="muted">{error}</p></main>}
      {!snap && !error && <main className="si-card muted">Loading…</main>}
      {snap && (
        <main className="si-card">
          <p className="si-meta">
            Shared by {snap.author} · {new Date(snap.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          <h1>{snap.question || 'Insight'}</h1>
          <div className="si-answer">
            <Markdown text={snap.answer} />
          </div>
          {snap.chart && <InsightChart data={snap.chart} />}
          {snap.queries.length > 0 && (
            <details className="in-queries">
              <summary>Based on {snap.queries.length} {snap.queries.length === 1 ? 'query' : 'queries'} over Somec's quotation data</summary>
              {snap.queries.map((q, k) => (
                <code key={k}>{q}</code>
              ))}
            </details>
          )}
          <div className="si-actions">
            <button
              className="primary"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true));
              }}
            >
              {copied ? '✓ Link copied' : 'Copy link'}
            </button>
            <button onClick={() => window.print()}>Save as PDF</button>
            {snap.chart && <button onClick={csv}>Download data (CSV)</button>}
          </div>
          <p className="si-foot">Estimated costs from Somec's historical cost analyses, not selling prices. This is a snapshot taken when the insight was shared.</p>
        </main>
      )}
    </div>
  );
}
