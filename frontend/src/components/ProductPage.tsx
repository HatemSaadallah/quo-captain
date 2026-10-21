import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, type CatalogFacets, type CatalogRecord, type Quotation } from '../api';
import { cleanTitle, dims, imageOf, locationOf, materialsOf, rankSimilar, sourceOf, typologyOf, type SimilarProduct } from '../product';
import { ProductCard } from './ProductHome';
import { AddProductButton } from './AddProductButton';

interface Props {
  id: string;
  quotations: Quotation[];
  facets: CatalogFacets | null;
  estimator: string;
  onAddToQuotation: (record: CatalogRecord, quotationId: string, quantity: number) => Promise<boolean>;
  onError: (msg: string) => void;
}

export function ProductPage({ id, quotations, facets, estimator, onAddToQuotation, onError }: Props) {
  const [r, setR] = useState<CatalogRecord | null>(null);
  const [similar, setSimilar] = useState<SimilarProduct[] | null>(null);
  const [qty, setQty] = useState('1');

  useEffect(() => {
    setR(null);
    setSimilar(null);
    window.scrollTo(0, 0);
    let live = true;
    api
      .record(id)
      .then(async (rec) => {
        if (!live) return;
        setR(rec);
        setQty(String(rec.quantity ?? 1));
        const hits = await api.similar(id, 50);
        if (live) setSimilar(rankSimilar(rec, hits).slice(0, 12));
      })
      .catch((e: unknown) => onError(String(e)));
    return () => {
      live = false;
    };
  }, [id, onError]);

  if (!r) return <div className="muted">Loading product…</div>;
  const ty = typologyOf(r);
  const mats = materialsOf(r);
  const breakdown = r.costBreakdown.map((c) => ({ ...c, unitCost: c.unitCost ?? 0 })).filter((c) => c.unitCost > 0).sort((a, b) => b.unitCost - a.unitCost);
  const total = breakdown.reduce((s, c) => s + c.unitCost, 0) || 1;
  return (
    <div className="stack">
      <div className="crumbs">
        <a href="#/catalog">Catalog</a> › <span>{ty.label}</span> › <b>{cleanTitle(r)}</b>
      </div>
      <section className="pdetail">
        <div className="pdimg" style={{ backgroundImage: `url(${imageOf(r)})` }}>
          <span className="ptype">{ty.label}</span>
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
            {fmtMoney(r.unitCost)} <span>/ {r.unit ?? 'unit'}</span>
          </div>
          <div className="small muted">{r.custom ? 'Custom catalog product; no historical cost is recorded.' : 'Estimated unit cost from the original analysis (not a selling price).'}</div>
          <dl className="specs">
            <dt>Typology</dt>
            <dd>{ty.label}</dd>
            <dt>Dimensions</dt>
            <dd>{dims(r) ?? '—'}</dd>
            <dt>Location</dt>
            <dd>{locationOf(r) ?? '—'}</dd>
            <dt>Unit weight</dt>
            <dd>{r.unitWeightKg ? `${fmtNum(r.unitWeightKg, 1)} kg` : '—'}</dd>
            <dt>Quantity supplied</dt>
            <dd>
              {fmtNum(r.quantity, 2)} {r.unit}
            </dd>
            <dt>Ship project</dt>
            <dd>
              {r.projectName ?? '—'} · {r.client ?? '—'}
            </dd>
            <dt>Offer</dt>
            <dd>
              {sourceOf(r)} · {r.projectDate ?? '—'} · {r.estimator ?? '—'}
            </dd>
            <dt>Source</dt>
            <dd className="small">{r.custom ? 'Custom catalog' : `${r.workbook} › sheet ${r.sheet} › row ${r.row}`}</dd>
          </dl>
          <div className="addbox">
            <label className="small muted" style={{ whiteSpace: 'nowrap' }}>
              Qty ({r.unit ?? 'unit'})
            </label>
            <input type="number" min={0.001} step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 100 }} aria-label="quantity" />
            <AddProductButton
              record={r}
              quotations={quotations}
              facets={facets}
              estimator={estimator}
              onError={onError}
              onAdd={(record, quotationId) => onAddToQuotation(record, quotationId, Number(qty) || 1)}
            />
          </div>
        </div>
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
                  <span>{c.category}</span>
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
