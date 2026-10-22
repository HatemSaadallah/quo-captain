import { useEffect, useState, lazy, Suspense } from 'react';
import '../product3d.css';
import { api, fmtMoney, fmtMaterialQty, type CatalogFacets, type CatalogRecord, type Quotation, type ProductMaterial } from '../api';
import { cleanTitle, costCategory, imageOf, LABOUR_CATEGORY, locationOf, productCost, rankSimilar, separateShare, sourceOf, TRANSPORT_CATEGORY, typologyOf, type SimilarProduct } from '../product';
import { navigate } from '../route';
import { ProductCard } from './ProductHome';
// three.js is large: load the 3D viewer only when it is opened.
const Product3D = lazy(() => import('./Product3D').then((m) => ({ default: m.Product3D })));
import { EditableSpecs, defaultSpec, specChanged, useSpecPreview, type CustomSpec } from './SpecCustomizer';
import '../product.css';
import { AddProductButton } from './AddProductButton';

interface Props {
  id: string;
  quotations: Quotation[];
  facets: CatalogFacets | null;
  estimator: string;
  onAddToQuotation: (record: CatalogRecord, quotationId: string, quantity: number, custom?: CustomSpec & { notes: string }) => Promise<boolean>;
  onError: (msg: string) => void;
}

export function ProductPage({ id, quotations, facets, estimator, onAddToQuotation, onError }: Props) {
  const [r, setR] = useState<CatalogRecord | null>(null);
  const [similar, setSimilar] = useState<SimilarProduct[] | null>(null);
  const [spec, setSpec] = useState<CustomSpec | null>(null);
  const [show3d, setShow3d] = useState(false);
  const [materials, setMaterials] = useState<ProductMaterial[]>([]);

  useEffect(() => {
    setR(null);
    setSimilar(null);
    setMaterials([]);
    window.scrollTo(0, 0);
    let live = true;
    Promise.all([api.record(id), api.productMaterials(id)])
      .then(async ([rec, billOfMaterials]) => {
        if (!live) return;
        setR(rec);
        setMaterials(billOfMaterials);
        setSpec(defaultSpec(rec, locationOf(rec)));
        const hits = await api.similar(id, 50);
        if (live) setSimilar(rankSimilar(rec, hits).slice(0, 6)); // two rows of three
      })
      .catch((e: unknown) => onError(String(e)));
    return () => {
      live = false;
    };
  }, [id, onError]);

  const base = r ? defaultSpec(r, locationOf(r)) : null;
  const { unitCost: customCost, busy: costing } = useSpecPreview(r, spec, base);
  if (!r || !base) return <div className="muted">Loading product…</div>;
  const customized = !!spec && specChanged(spec, base);
  // Labour and transport are quoted as separate lines, so the product price leaves them out.
  const share = separateShare(r);
  const baseCost = productCost(r);
  const shownCustom = customCost != null ? customCost * share.keep : null;
  const delta = customized && shownCustom != null && baseCost ? (shownCustom - baseCost) / baseCost : null;
  // Specs the cost engine does not use travel to the quotation line as a note.
  const notes = !spec
    ? ''
    : [spec.weightKg !== base.weightKg ? `Unit weight ${spec.weightKg ?? '—'} kg` : '', spec.location !== base.location ? `Location ${spec.location || '—'}` : ''].filter(Boolean).join(' · ');
  const ty = typologyOf(r);
  const mats = [...new Set(materials.map((link) => link.material.name))];
  const allParts = r.costBreakdown.map((c) => ({ ...c, unitCost: c.unitCost ?? 0 })).filter((c) => c.unitCost > 0).sort((a, b) => b.unitCost - a.unitCost);
  const isSeparate = (c: { category: string }): boolean => LABOUR_CATEGORY.test(c.category) || TRANSPORT_CATEGORY.test(c.category);
  const breakdown = allParts.filter((c) => !isSeparate(c));
  const total = breakdown.reduce((s, c) => s + c.unitCost, 0) || 1;
  return (
    <div className="stack">
      {show3d && (
        <Suspense fallback={<div className="p3d-backdrop"><div className="p3d-loading">Loading 3D view…</div></div>}>
          <Product3D kind={ty.key} L={spec?.L ?? r.L} H={spec?.H ?? r.H} title={r.title ?? cleanTitle(r)} moduleMm={Number(r.params.find((p) => /interasse/i.test(p.label))?.value) || null} onClose={() => setShow3d(false)} />
        </Suspense>
      )}
      <div className="crumbs">
        <a href="#/catalog">Catalog</a> › <span>{ty.label}</span> › <b>{cleanTitle(r)}</b>
      </div>
      <section className="pdetail">
        <div className="pdimg" style={{ backgroundImage: `url(${imageOf(r)})` }}>
          <span className="ptype">{ty.label}</span>
          <button className="pd-3d" onClick={() => setShow3d(true)}>
            ⟳ View in 3D on a cruise deck
          </button>
        </div>
        <div className="pdinfo">
          <h1>{cleanTitle(r)}</h1>
          <div className="pmeta">
            Item {r.itemCode ?? '—'} · {r.categoryName ?? '—'}
          </div>
          <div className="pmats" style={{ margin: '10px 0' }}>
            {mats.map((m) => (
              <span key={m} className="mat">
                {m}
              </span>
            ))}
            {mats.length === 0 && <span className="muted small">material not specified</span>}
          </div>
          <div className="pdprice">
            {customized && shownCustom != null ? fmtMoney(shownCustom) : fmtMoney(baseCost)} <span>/ {r.unit ?? 'unit'}</span>
            {customized && (costing ? <span className="pd-recalc">recalculating…</span> : delta !== null && Math.abs(delta) >= 0.0005 ? <span className={`spec-delta ${delta > 0 ? 'up' : 'down'}`}>{`${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}</span> : null)}
          </div>
          {customized && (
            <div className="pd-custom">
              Customized specs · original {fmtMoney(baseCost)}
              <button className="q-link" onClick={() => setSpec(base)}>
                Reset
              </button>
            </div>
          )}
          <div className="small muted">{r.custom ? 'Custom catalog product; no historical cost is recorded.' : 'Estimated product cost from the original analysis, excluding labour and transport (not a selling price).'}</div>
          {spec ? (
            <EditableSpecs
              record={r}
              spec={spec}
              base={base}
              onChange={setSpec}
              fixed={[
                ['Typology', ty.label],
                ['Ship project', `${r.projectName ?? '—'} · ${r.client ?? '—'}`],
                ['Offer', `${sourceOf(r)} · ${r.projectDate ?? '—'} · ${r.estimator ?? '—'}`],
              ]}
            />
          ) : null}
          <p className="pd-hint">Use ✎ to change a spec. Size and analysis inputs recalculate the cost.</p>
          <div className="addbox">
            <span className="small muted">
              {spec ? `${spec.quantity} ${r.unit ?? 'units'}${customized ? ' · customized' : ''}` : ''}
            </span>
            <AddProductButton
              record={r}
              quotations={quotations}
              facets={facets}
              estimator={estimator}
              onError={onError}
              onAdd={(record, quotationId) => onAddToQuotation(record, quotationId, spec?.quantity || 1, spec ? { ...spec, notes } : undefined)}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="bom-head">
          <div>
            <h2>Bill of materials</h2>
            <p>Raw material for one {r.unit ?? 'unit'}, from the original cost analysis. Raw-material prices are indicative.</p>
          </div>
          {materials.length > 0 && (
            <div className="bom-total">
              <span>Materials per {r.unit ?? 'unit'}</span>
              <b>{fmtMoney(materials.reduce((acc, l) => acc + l.quantity * l.material.unitCost, 0))}</b>
            </div>
          )}
        </div>
        {materials.length ? (
          <div className="bom">
            {(() => {
              const rows = [...materials].map((l) => ({ l, cost: l.quantity * l.material.unitCost })).sort((a, b) => b.cost - a.cost);
              const max = Math.max(...rows.map((x) => x.cost), 1);
              const total = rows.reduce((acc, x) => acc + x.cost, 0) || 1;
              return rows.map(({ l, cost }) => (
                <div key={l.id} className="bom-row" title={l.sourceNote ?? undefined}>
                  <button className="bom-name" onClick={() => navigate({ page: 'materials', id: l.material.id })}>
                    {l.material.name}
                    {l.quantitySource === 'mock' && <span className="bom-flag">estimated qty</span>}
                  </button>
                  <span className="bom-qty">
                    {fmtMaterialQty(l.quantity)} {l.material.unit}
                  </span>
                  <span className="bom-price">
                    {fmtMoney(l.material.unitCost)}/{l.material.unit}
                  </span>
                  <span className="bom-bar" aria-hidden="true">
                    <i style={{ width: `${(cost / max) * 100}%` }} />
                  </span>
                  <span className="bom-cost">{fmtMoney(cost)}</span>
                  <span className="bom-share">{Math.round((cost / total) * 100)}%</span>
                </div>
              ));
            })()}
          </div>
        ) : (
          <p className="muted">No material quantities are recorded for this product.</p>
        )}
      </section>

      <section className="panel">
        <div className="grid2">
          <div>
            <h2>Description</h2>
            <p className="desc">{r.description}</p>
          </div>
          <div>
            <h2>Cost composition</h2>
            {breakdown.slice(0, 8).map((c) => (
              <div key={c.code} className="bar">
                <div className="bar-label">
                  <span title={c.category}>{costCategory(c.category)}</span>
                  <span>{fmtMoney(c.unitCost)}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(c.unitCost / total) * 100}%` }} />
                </div>
              </div>
            ))}
            {breakdown.length === 0 && <div className="muted small">No breakdown recorded for this analysis.</div>}
          </div>
        </div>
      </section>

      <div className="section-head">
        <h2>Similar products</h2>
        <span className="muted small">ranked by description similarity, same typology and shared materials</span>
      </div>
      {!similar && <div className="muted">Finding similar products…</div>}
      <div className="pgrid">
        {similar?.map((s) => (
          <div key={s.hit.record.id} className="simwrap">
            <ProductCard r={s.hit.record} quotations={quotations} facets={facets} estimator={estimator} onError={onError} onAddToQuotation={(rec, quotationId) => onAddToQuotation(rec, quotationId, 1)} badge={`${Math.min(97, Math.round(s.score * 100))}% match`} />
            <div className="reasons">
              {s.sameTypology && <span className="reason">Same typology</span>}
              {s.sharedMaterials.map((m) => (
                <span key={m} className="reason">
                  {m}
                </span>
              ))}
              {s.hit.record.unitCost && r.unitCost ? (
                <span className="reason muted">
                  {s.hit.record.unitCost > r.unitCost ? '+' : ''}
                  {Math.round(((s.hit.record.unitCost - r.unitCost) / r.unitCost) * 100)}% cost
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
