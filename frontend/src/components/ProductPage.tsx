import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum, type CatalogRecord, type Quotation } from '../api';
import { cleanTitle, dims, imageOf, locationOf, materialsOf, rankSimilar, sourceOf, typologyOf, type SimilarProduct } from '../product';
import { navigate } from '../route';
import { ProductCard } from './ProductHome';

interface Props {
  id: string;
  quotations: Quotation[];
  onAdd: (quotationId: string, record: CatalogRecord, quantity: number) => Promise<void>;
  onError: (msg: string) => void;
}

export function ProductPage({ id, quotations, onAdd, onError }: Props) {
  const [r, setR] = useState<CatalogRecord | null>(null);
  const [similar, setSimilar] = useState<SimilarProduct[] | null>(null);
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState('1');
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    setR(null);
    setSimilar(null);
    setAdded(null);
    window.scrollTo(0, 0);
    let live = true;
    api
      .record(id)
      .then(async (rec) => {
        if (!live) return;
        setR(rec);
        setQty(String(rec.quantity ?? 1));
        const hits = await api.similar(id, 40);
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
  const quotation = quotations.find((x) => x.id === target) ?? quotations[0];

  const add = async (): Promise<void> => {
    if (!quotation) return navigate({ page: 'new', step: 1 });
    await onAdd(quotation.id, r, Number(qty) || 1);
    setAdded(quotation.reference || quotation.name);
  };

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
          <div className="small muted">Estimated unit cost from the original analysis (not a selling price).</div>
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
            <dd className="small">
              {r.workbook} › sheet {r.sheet} › row {r.row}
            </dd>
          </dl>
          <div className="addbox">
            <select value={quotation?.id ?? ''} onChange={(e) => setTarget(e.target.value)} aria-label="quotation">
              {quotations.length === 0 && <option value="">No quotation yet</option>}
              {quotations.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.reference || '(no ref)'} · {x.name}
                </option>
              ))}
            </select>
            <input type="number" min={0.001} step="any" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 90 }} aria-label="quantity" />
            <button className="primary" onClick={() => void add()}>
              {quotation ? 'Add to quotation' : 'Start a quotation'}
            </button>
          </div>
          {added && (
            <div className="small" style={{ color: 'var(--ok)', marginTop: 6 }}>
              Added to {added}.{' '}
              <a href={`#/quotations/${quotation?.id}`}>Open quotation →</a>
            </div>
          )}
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
            <ProductCard r={s.hit.record} badge={`${Math.min(97, Math.round(s.score * 100))}% match`} />
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
