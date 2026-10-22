import { useEffect, useRef, useState } from 'react';
import { api, fmtMoney, type CatalogRecord } from '../api';

export interface CustomSpec {
  quantity: number;
  L: number | null;
  H: number | null;
  description: string;
  params: Array<{ cell: string; value: number | string | null }>;
}

/** Plain-English names for the Italian parameter labels found in the analysis sheets. */
const LABELS: Array<[RegExp, string]> = [
  [/interasse/i, 'Module width (spacing)'],
  [/profondit/i, 'Depth'],
  [/altezza/i, 'Height'],
  [/larghezza/i, 'Width'],
  [/lunghezza/i, 'Length'],
  [/spessore/i, 'Thickness'],
  [/peso/i, 'Weight'],
];
const label = (raw: string): string => {
  const hit = LABELS.find(([re]) => re.test(raw));
  return hit ? hit[1] : raw.charAt(0) + raw.slice(1).toLowerCase();
};

export const defaultSpec = (r: CatalogRecord): CustomSpec => ({
  quantity: r.quantity && r.quantity > 0 ? Math.round(r.quantity * 1000) / 1000 : 1,
  L: r.L,
  H: r.H,
  description: r.description ?? r.title ?? '',
  params: r.params.filter((p) => p.editable).map((p) => ({ cell: p.cell, value: p.value })),
});

const sameSpec = (a: CustomSpec, b: CustomSpec): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Edit a product's specs and see its unit cost recalculated from the original analysis. */
export function SpecCustomizer({ record, spec, onChange }: { record: CatalogRecord; spec: CustomSpec; onChange: (s: CustomSpec) => void }) {
  const base = defaultSpec(record);
  const changed = !sameSpec(spec, base);
  const [preview, setPreview] = useState<{ unitCost: number | null; computed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Debounced recalculation through the cost engine; nothing is saved.
  useEffect(() => {
    if (!changed) return setPreview(null);
    const n = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(() => {
      api
        .previewProduct(record.id, { quantity: spec.quantity, L: spec.L, H: spec.H, description: spec.description, params: spec.params })
        .then((p) => n === seq.current && setPreview(p))
        .catch(() => n === seq.current && setPreview(null))
        .finally(() => n === seq.current && setBusy(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [record.id, spec, changed]);

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
  const setParam = (cell: string, raw: string, numeric: boolean): void => onChange({ ...spec, params: spec.params.map((p) => (p.cell === cell ? { ...p, value: numeric ? num(raw) : raw } : p)) });
  const editable = record.params.filter((p) => p.editable);
  const delta = preview?.unitCost != null && record.unitCost ? (preview.unitCost - record.unitCost) / record.unitCost : null;

  return (
    <section className="spec">
      <div className="spec-head">
        <div>
          <h2>Customize specs</h2>
          <p>Adjust the size, quantity and analysis inputs; the unit cost is recalculated from the original cost analysis.</p>
        </div>
        {changed && (
          <button className="spec-reset" onClick={() => onChange(base)}>
            Reset to original
          </button>
        )}
      </div>

      <div className="spec-grid">
        <label className="spec-field">
          <span>Quantity</span>
          <div className="spec-input">
            <input type="number" min={0.001} step="any" value={spec.quantity} onChange={(e) => onChange({ ...spec, quantity: Number(e.target.value) || 0 })} aria-label="quantity" />
            <em>{record.unit ?? 'unit'}</em>
          </div>
        </label>
        <label className="spec-field">
          <span>Length</span>
          <div className="spec-input">
            <input type="number" min={0} step="any" value={spec.L ?? ''} onChange={(e) => onChange({ ...spec, L: num(e.target.value) })} aria-label="length in millimetres" />
            <em>mm</em>
          </div>
        </label>
        <label className="spec-field">
          <span>Height / depth</span>
          <div className="spec-input">
            <input type="number" min={0} step="any" value={spec.H ?? ''} onChange={(e) => onChange({ ...spec, H: num(e.target.value) })} aria-label="height in millimetres" />
            <em>mm</em>
          </div>
        </label>
        {editable.map((p) => {
          const value = spec.params.find((x) => x.cell === p.cell)?.value ?? null;
          const numeric = typeof p.value === 'number';
          const moved = value !== p.value;
          return (
            <label key={p.cell} className={`spec-field ${moved ? 'moved' : ''}`} title={`Analysis input ${p.cell}: ${p.label}`}>
              <span>
                {label(p.label)} {moved && <i>was {String(p.value)}</i>}
              </span>
              <div className="spec-input">
                <input type={numeric ? 'number' : 'text'} step="any" value={value ?? ''} onChange={(e) => setParam(p.cell, e.target.value, numeric)} aria-label={label(p.label)} />
                {p.unit && <em>{p.unit.toLowerCase()}</em>}
              </div>
            </label>
          );
        })}
      </div>

      <label className="spec-field spec-desc">
        <span>Description on the quotation</span>
        <textarea rows={3} value={spec.description} onChange={(e) => onChange({ ...spec, description: e.target.value })} />
      </label>

      <div className={`spec-result ${changed ? 'on' : ''}`} aria-live="polite">
        {!changed ? (
          <span className="muted">Original specs · {fmtMoney(record.unitCost)} per {record.unit ?? 'unit'}</span>
        ) : busy ? (
          <span className="muted">Recalculating…</span>
        ) : preview?.unitCost != null ? (
          <>
            <span>Customized unit cost</span>
            <b>{fmtMoney(preview.unitCost)}</b>
            <span className="muted">/ {record.unit ?? 'unit'}</span>
            {delta !== null && Math.abs(delta) >= 0.0005 && <span className={`spec-delta ${delta > 0 ? 'up' : 'down'}`}>{`${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}</span>}
            <span className="spec-total">
              Total {fmtMoney(preview.unitCost * spec.quantity)} for {spec.quantity} {record.unit ?? 'units'}
            </span>
            {!preview.computed && <span className="muted small">historical cost (no recalculation available for this item)</span>}
          </>
        ) : (
          <span className="muted">Cost preview unavailable for these values.</span>
        )}
      </div>
    </section>
  );
}
