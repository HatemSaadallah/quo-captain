import { useEffect, useMemo, useState } from 'react';
import { api, fmtMoney, type CatalogFacets, type CatalogRecord } from '../api';
import { cleanTitle, dims, imageOf, isProduct, materialsOf, MATERIALS, sourceOf, typologyOf, TYPOLOGIES } from '../product';
import { navigate } from '../route';
import { SearchSuggest } from './SearchSuggest';

interface Props {
  facets: CatalogFacets | null;
  onError: (msg: string) => void;
  onAddToCart: (r: CatalogRecord) => Promise<void>;
}

let allCache: CatalogRecord[] | null = null;

/** The whole catalog: one blank search per source workbook (the API caps a page at 200). */
async function loadAll(facets: CatalogFacets): Promise<CatalogRecord[]> {
  if (allCache) return allCache;
  const pages = await Promise.all(facets.workbooks.map((w) => api.search('', { workbook: w.workbook, limit: 200 })));
  allCache = pages.flatMap((p) => p.hits.map((h) => h.record)).filter((r) => r.sheet && r.unitCost && isProduct(r));
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

export function ProductCard({ r, badge, onAdd }: { r: CatalogRecord; badge?: string; onAdd?: (r: CatalogRecord) => Promise<void> }) {
  const ty = typologyOf(r);
  const mats = materialsOf(r);
  const [state, setState] = useState<'idle' | 'adding' | 'added'>('idle');
  const open = (): void => navigate({ page: 'product', id: r.id });
  return (
    <div className="pcard" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
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
          {onAdd ? (
            <button
              className={`cart-btn ${state}`}
              disabled={state === 'adding'}
              onClick={(e) => {
                e.stopPropagation();
                setState('adding');
                void onAdd(r).then(() => {
                  setState('added');
                  window.setTimeout(() => setState('idle'), 1800);
                });
              }}
            >
              {state === 'added' ? '✓ Added' : state === 'adding' ? 'Adding…' : '+ Add to cart'}
            </button>
          ) : (
            <span className="muted small" style={{ marginLeft: 'auto' }}>
              est. cost
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductHome({ facets, onError, onAddToCart }: Props) {
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

  const search = async (query = q): Promise<void> => {
    setShown(24);
    if (!query.trim()) return setHits(null);
    setBusy(true);
    try {
      const res = await api.search(query, { limit: 80 });
      setHits(res.hits.map((h) => h.record).filter((r) => r.sheet && isProduct(r)));
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
          <h1>Every glass balcony, windscreen and deck we have ever costed.</h1>
          <p>Search {all?.length ?? '…'} glass and flooring products from past cruise-ship offers and reuse their cost analysis in a new quotation.</p>
          <SearchSuggest
            q={q}
            setQ={setQ}
            busy={busy}
            onSubmit={(query) => void search(query)}
            onTypology={(key) => {
              setQ('');
              setHits(null);
              setTypology(key);
              document.querySelector('.filters')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
          <div className="hero-stats">
            <div>
              <b>{all?.length ?? '—'}</b>
              <span>catalog products</span>
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
          <ProductCard key={r.id} r={r} onAdd={onAddToCart} />
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
