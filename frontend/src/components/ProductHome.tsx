import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, fmtMoney, type CatalogFacets, type CatalogRecord } from '../api';
import { cleanTitle, dims, imageOf, materialsOf, MATERIALS, sourceOf, typologyOf, TYPOLOGIES } from '../product';
import { navigate } from '../route';

interface Props {
  facets: CatalogFacets | null;
  onError: (msg: string) => void;
}

let allCache: CatalogRecord[] | null = null;

/** The whole catalog: one blank search per source workbook (the API caps a page at 200). */
async function loadAll(facets: CatalogFacets): Promise<CatalogRecord[]> {
  if (allCache) return allCache;
  const pages = await Promise.all(facets.workbooks.map((w) => api.search('', { workbook: w.workbook, limit: 200 })));
  allCache = pages.flatMap((p) => p.hits.map((h) => h.record)).filter((r) => r.sheet && r.unitCost);
  return allCache;
}

/** Interleave typologies so the landing grid shows the range of products, not 40 windscreens in a row. */
function featured(records: CatalogRecord[]): CatalogRecord[] {
  const groups = new Map<string, CatalogRecord[]>();
  for (const r of records) {
    const k = typologyOf(r).key;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const lists = [...groups.values()].map((l) => l.sort((a, b) => (b.L && b.H ? 1 : 0) - (a.L && a.H ? 1 : 0)));
  const out: CatalogRecord[] = [];
  for (let i = 0; out.length < records.length; i++) {
    for (const l of lists) if (l[i]) out.push(l[i]);
    if (lists.every((l) => i >= l.length)) break;
  }
  return out;
}

export function ProductCard({ r, badge }: { r: CatalogRecord; badge?: string }) {
  const ty = typologyOf(r);
  const mats = materialsOf(r);
  return (
    <button className="pcard" onClick={() => navigate({ page: 'product', id: r.id })}>
      <div className="pimg" style={{ backgroundImage: `url(${imageOf(r)})` }}>
        <span className="ptype">{ty.label}</span>
        {badge && <span className="pbadge">{badge}</span>}
      </div>
      <div className="pbody">
        <div className="ptitle">{cleanTitle(r)}</div>
        <div className="pmeta">
          {sourceOf(r)} · {r.client ?? "—"}
          {dims(r) ? ` · ${dims(r)}` : ''}
        </div>
        <div className="pmats">
          {mats.slice(0, 3).map((m) => (
            <span key={m} className="mat">
              {m}
            </span>
          ))}
        </div>
        <div className="pprice">
          <b>{fmtMoney(r.unitCost)}</b>
          <span className="muted"> / {r.unit ?? 'unit'}</span>
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            est. cost
          </span>
        </div>
      </div>
    </button>
  );
}

export function ProductHome({ facets, onError }: Props) {
  const [all, setAll] = useState<CatalogRecord[] | null>(allCache);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CatalogRecord[] | null>(null);
  const [typology, setTypology] = useState('');
  const [material, setMaterial] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(24);

  useEffect(() => {
    if (facets && !all) loadAll(facets).then(setAll).catch((e: unknown) => onError(String(e)));
  }, [facets, all, onError]);

  const search = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault();
    setShown(24);
    if (!q.trim()) return setHits(null);
    setBusy(true);
    try {
      const res = await api.search(q, { limit: 80 });
      setHits(res.hits.map((h) => h.record).filter((r) => r.sheet));
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const base = useMemo(() => hits ?? featured(all ?? []), [hits, all]);
  const list = base.filter((r) => (!typology || typologyOf(r).key === typology) && (!material || materialsOf(r).includes(material)));
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of base) c.set(typologyOf(r).key, (c.get(typologyOf(r).key) ?? 0) + 1);
    return c;
  }, [base]);
  const clients = new Set((facets?.workbooks ?? []).map((w) => w.client)).size;

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-inner">
          <div className="eyebrow">Somec Marine · Product intelligence</div>
          <h1>Every balcony, windscreen and divider we have ever costed.</h1>
          <p>Search {facets?.recordCount ?? '…'} engineered products from past cruise-ship offers and reuse their cost analysis in a new quotation.</p>
          <form className="hero-search" onSubmit={(e) => void search(e)}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “glass windscreen 2000 high”, “teak decking”, “divider with door”…" aria-label="search products" />
            <button className="primary" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : 'Search'}
            </button>
          </form>
          <div className="hero-stats">
            <div>
              <b>{facets?.recordCount ?? '—'}</b>
              <span>analysed products</span>
            </div>
            <div>
              <b>{facets?.workbooks.length ?? '—'}</b>
              <span>ship projects</span>
            </div>
            <div>
              <b>{clients || '—'}</b>
              <span>shipyard clients</span>
            </div>
            <div>
              <b>{TYPOLOGIES.length}</b>
              <span>product typologies</span>
            </div>
          </div>
        </div>
      </section>

      <div className="filters">
        <button className={`fchip ${typology === '' ? 'on' : ''}`} onClick={() => setTypology('')}>
          All products <span>{base.length}</span>
        </button>
        {TYPOLOGIES.filter((t) => counts.get(t.key)).map((t) => (
          <button key={t.key} className={`fchip ${typology === t.key ? 'on' : ''}`} onClick={() => setTypology(typology === t.key ? '' : t.key)}>
            {t.label} <span>{counts.get(t.key)}</span>
          </button>
        ))}
        <select value={material} onChange={(e) => setMaterial(e.target.value)} style={{ width: 'auto', marginLeft: 'auto' }} aria-label="material">
          <option value="">Any material</option>
          {MATERIALS.map((m) => (
            <option key={m.label}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="section-head">
        <h2>{hits ? `${list.length} results for “${q}”` : 'Featured products'}</h2>
        {hits && (
          <button
            onClick={() => {
              setQ('');
              setHits(null);
            }}
          >
            Clear search
          </button>
        )}
      </div>
      {!all && !hits && <div className="muted">Loading catalog…</div>}
      <div className="pgrid">
        {list.slice(0, shown).map((r) => (
          <ProductCard key={r.id} r={r} />
        ))}
      </div>
      {list.length > shown && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setShown(shown + 24)}>Show more ({list.length - shown} more)</button>
        </div>
      )}
      {list.length === 0 && (all || hits) && <div className="muted">No product matches these filters.</div>}
    </div>
  );
}
