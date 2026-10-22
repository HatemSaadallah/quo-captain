import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, fmtMoney, type CatalogFacets, type CatalogRecord, type Quotation } from '../api';
import { cleanTitle, dims, imageOf, isProduct, materialsOf, MATERIALS, productCost, setCustomImages, suggestImages, sourceOf, typologyOf, TYPOLOGIES } from '../product';
import { navigate } from '../route';
import { SearchSuggest } from './SearchSuggest';
import { AddProductButton } from './AddProductButton';

interface Props {
  facets: CatalogFacets | null;
  quotations: Quotation[];
  estimator: string;
  onError: (msg: string) => void;
  onAddToQuotation: (r: CatalogRecord, quotationId: string) => Promise<boolean>;
  initialQuery?: string;
  initialCreate?: boolean;
}

let allCache: CatalogRecord[] | null = null;

/** The whole catalog: one blank search per source workbook (the API caps a page at 200). */
async function loadAll(facets: CatalogFacets): Promise<CatalogRecord[]> {
  if (allCache) return allCache;
  const [pages, custom] = await Promise.all([Promise.all(facets.workbooks.map((w) => api.search('', { workbook: w.workbook, limit: 200 }))), api.customProducts()]);
  allCache = [...custom, ...pages.flatMap((p) => p.hits.map((h) => h.record)).filter((r) => r.sheet && r.unitCost && isProduct(r))];
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

export function ProductCard({ r, badge, quotations, facets, estimator, onError, onAddToQuotation }: { r: CatalogRecord; badge?: string; quotations: Quotation[]; facets: CatalogFacets | null; estimator: string; onError: (msg: string) => void; onAddToQuotation: (r: CatalogRecord, quotationId: string) => Promise<boolean> }) {
  const ty = typologyOf(r);
  const mats = materialsOf(r);
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
          <div>Lot: {r.lotto ?? 'Not assigned'}</div>
        </div>
        <div className="pmats">
          {mats.slice(0, 3).map((m) => (
            <span key={m} className="mat">
              {m}
            </span>
          ))}
        </div>
        <div className="pprice">
          <b>{fmtMoney(productCost(r))}</b>
          <span className="muted"> / {r.unit ?? 'unit'}</span>
          <AddProductButton record={r} quotations={quotations} facets={facets} estimator={estimator} onAdd={onAddToQuotation} onError={onError} />
        </div>
      </div>
    </div>
  );
}

export function ProductHome({ facets, quotations, estimator, onError, onAddToQuotation, initialQuery, initialCreate }: Props) {
  const [all, setAll] = useState<CatalogRecord[] | null>(allCache);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CatalogRecord[] | null>(null);
  const [typology, setTypology] = useState('');
  const [material, setMaterial] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(24);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '', categoryName: '', itemCode: '', unit: 'Pcs', L: '', H: '' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const suggestions = suggestImages(`${draft.title} ${draft.categoryName} ${draft.description}`);
  const chosenPreset = preset && suggestions.includes(preset) ? preset : suggestions[0];

  useEffect(() => {
    if (facets && !all) loadAll(facets).then(setAll).catch((e: unknown) => onError(String(e)));
  }, [facets, all, onError]);

  useEffect(() => {
    if (initialQuery && initialQuery !== q) {
      setQ(initialQuery);
      void search(initialQuery);
    }
  }, [initialQuery]);
  useEffect(() => { if (initialCreate) setCreating(true); }, [initialCreate]);

  const search = async (query = q): Promise<void> => {
    setShown(24);
    if (!query.trim()) return setHits(null);
    setBusy(true);
    try {
      const res = await api.search(query, { limit: 80 });
      setHits(res.hits.map((h) => h.record).filter((r) => r.custom || (r.sheet && isProduct(r))));
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
  const createProduct = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      const record = await api.createCatalogProduct({ ...draft, L: draft.L ? Number(draft.L) : null, H: draft.H ? Number(draft.H) : null });
      // Image is optional: an uploaded file, otherwise the suggested photo picked from the description.
      await api.setProductImage(record.id, imageFile ? { file: imageFile } : { preset: chosenPreset }).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
      setCustomImages(await api.catalogImages().catch(() => ({})));
      setImageFile(null);
      setPreset(null);
      const existing = allCache ?? (facets ? await loadAll(facets) : []);
      allCache = [record, ...existing.filter((item) => item.id !== record.id)];
      setAll(allCache);
      setHits(null);
      setCreating(false);
      setDraft({ title: '', description: '', categoryName: '', itemCode: '', unit: 'Pcs', L: '', H: '' });
    } catch (err) { onError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };

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
        <button onClick={() => setCreating(true)}>＋ New catalog product</button>
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
          <ProductCard key={r.id} r={r} quotations={quotations} facets={facets} estimator={estimator} onError={onError} onAddToQuotation={onAddToQuotation} />
        ))}
      </div>
      {list.length > shown && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setShown(shown + 24)}>Show more ({list.length - shown} more)</button>
        </div>
      )}
      {list.length === 0 && (all || hits) && <div className="muted">No product matches these filters.</div>}
      {creating && <div className="modal-backdrop" onClick={() => setCreating(false)}><form className="panel stack" onSubmit={(e) => void createProduct(e)} onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 94vw)', margin: '10vh auto', maxHeight: '80vh', overflow: 'auto' }}>
        <div className="section-head"><h2>New catalog product</h2><button type="button" onClick={() => setCreating(false)}>×</button></div>
        <label>Product name *<input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>Description *<textarea required rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className="grid2"><label>Category *<input required value={draft.categoryName} onChange={(e) => setDraft({ ...draft, categoryName: e.target.value })} /></label><label>Unit *<input required value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></label></div>
        <div className="grid2"><label>Item code<input value={draft.itemCode} onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })} /></label><label>Length (mm)<input type="number" min="0" value={draft.L} onChange={(e) => setDraft({ ...draft, L: e.target.value })} /></label><label>Height (mm)<input type="number" min="0" value={draft.H} onChange={(e) => setDraft({ ...draft, H: e.target.value })} /></label></div>
        <div className="np-image">
          <div className="np-image-head">
            <span>Image <em>(optional)</em></span>
            <label className="np-upload">
              {imageFile ? 'Change image' : 'Upload image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {imageFile ? (
            <div className="np-preview">
              <img src={URL.createObjectURL(imageFile)} alt="Uploaded product" />
              <div>
                <b>{imageFile.name}</b>
                <button type="button" className="q-link" onClick={() => setImageFile(null)}>Remove and use a suggestion</button>
              </div>
            </div>
          ) : (
            <>
              <p className="small muted">No image? Pick one suggested from the description.</p>
              <div className="np-suggest">
                {suggestions.map((src) => (
                  <button type="button" key={src} className={src === chosenPreset ? 'on' : ''} onClick={() => setPreset(src)} aria-label="Use this suggested image" aria-pressed={src === chosenPreset} style={{ backgroundImage: `url(${src})` }} />
                ))}
              </div>
            </>
          )}
        </div>
        <button className="primary" disabled={saving}>{saving ? 'Saving and embedding…' : 'Save product'}</button>
      </form></div>}
    </div>
  );
}
