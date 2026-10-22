import { useEffect, useRef, useState } from 'react';
import { api, fmtNum, type CatalogRecord } from '../api';

export interface CustomSpec {
  quantity: number;
  L: number | null;
  H: number | null;
  weightKg: number | null;
  /** true once the user typed a weight; otherwise it follows the size. */
  weightManual: boolean;
  location: string;
  lotto: string;
  description: string;
  params: Array<{ cell: string; value: number | string | null }>;
}

/** Analysis inputs that are really the product's dimensions: editing L/H updates them too. */
const WIDTH = /interasse|larghezza|lunghezza|width|length/i;
const DEPTH = /profondit|altezza|depth|height/i;

export const defaultSpec = (r: CatalogRecord, location: string | null): CustomSpec => ({
  quantity: r.quantity && r.quantity > 0 ? Math.round(r.quantity * 1000) / 1000 : 1,
  L: r.L,
  H: r.H,
  weightKg: r.unitWeightKg ? Math.round(r.unitWeightKg * 10) / 10 : null,
  weightManual: false,
  location: location ?? '',
  lotto: r.lotto ?? '',
  description: r.description ?? r.title ?? '',
  params: r.params.filter((p) => p.editable).map((p) => ({ cell: p.cell, value: p.value })),
});

export const specChanged = (a: CustomSpec, b: CustomSpec): boolean => JSON.stringify({ ...a, weightManual: false }) !== JSON.stringify({ ...b, weightManual: false });

/** Change one dimension: keep linked analysis inputs and the size-based weight estimate in step. */
export function withDimension(r: CatalogRecord, spec: CustomSpec, key: 'L' | 'H', value: number | null): CustomSpec {
  const next = { ...spec, [key]: value };
  const re = key === 'L' ? WIDTH : DEPTH;
  next.params = spec.params.map((p) => {
    const meta = r.params.find((x) => x.cell === p.cell);
    return meta && typeof meta.value === 'number' && re.test(meta.label) && value !== null ? { ...p, value } : p;
  });
  if (!spec.weightManual && r.unitWeightKg && r.L && r.H && next.L && next.H) {
    next.weightKg = Math.round(r.unitWeightKg * ((next.L * next.H) / (r.L * r.H)) * 10) / 10;
  }
  return next;
}

/** Recalculated unit cost for the current specs (debounced; nothing is saved). */
export function useSpecPreview(r: CatalogRecord | null, spec: CustomSpec | null, base: CustomSpec | null): { unitCost: number | null; busy: boolean } {
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const changed = !!(r && spec && base && specChanged(spec, base));
  useEffect(() => {
    if (!r || !spec || !changed) {
      setUnitCost(null);
      setBusy(false);
      return;
    }
    const n = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(() => {
      api
        .previewProduct(r.id, { quantity: spec.quantity, L: spec.L, H: spec.H, description: spec.description, params: spec.params })
        .then((p) => n === seq.current && setUnitCost(p.unitCost))
        .catch(() => n === seq.current && setUnitCost(null))
        .finally(() => n === seq.current && setBusy(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [r, spec, changed]);
  return { unitCost, busy };
}

/** A spec value shown as text with an edit button; the input appears only while editing. */
function Field({ value, onChange, suffix, type = 'number', label, original, width = 92, display }: { value: string | number | null; onChange: (v: string) => void; suffix?: string; type?: 'number' | 'text'; label: string; original?: string | number | null; width?: number; display?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const moved = original !== undefined && String(original ?? '') !== String(value ?? '');
  const shown = display ?? (value === null || value === '' ? '—' : typeof value === 'number' ? fmtNum(value, 2) : value);
  const commit = (): void => {
    onChange(draft);
    setEditing(false);
  };
  if (editing) {
    return (
      <span className="sv editing">
        <input
          autoFocus
          type={type}
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label={label}
          style={{ width }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    );
  }
  return (
    <span className={`sv ${moved ? 'moved' : ''}`} title={moved ? `Original: ${original ?? '—'}` : undefined}>
      <span className="sv-text">
        {shown}
        {suffix && shown !== '—' ? ` ${suffix}` : ''}
      </span>
      <button
        type="button"
        className="sv-edit"
        aria-label={`Edit ${label}`}
        title={`Edit ${label}`}
        onClick={() => {
          setDraft(value === null ? '' : String(value));
          setEditing(true);
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
    </span>
  );
}

/** The product's spec list, editable in place. */
export function EditableSpecs({ record, spec, base, onChange, fixed }: { record: CatalogRecord; spec: CustomSpec; base: CustomSpec; onChange: (s: CustomSpec) => void; fixed: Array<[string, string]> }) {
  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));
  const linked = new Set(record.params.filter((p) => typeof p.value === 'number' && (WIDTH.test(p.label) || DEPTH.test(p.label))).map((p) => p.cell));
  const others = record.params.filter((p) => p.editable && !linked.has(p.cell));
  const area = spec.L && spec.H ? (spec.L * spec.H) / 1e6 : null;
  return (
    <dl className="specs specs-edit">
      {fixed.slice(0, 1).map(([k, v]) => (
        <SpecRow key={k} k={k}>
          {v}
        </SpecRow>
      ))}
      <SpecRow k="Dimensions">
        <Field label="Length in mm" value={spec.L} original={base.L} onChange={(v) => onChange(withDimension(record, spec, 'L', num(v)))} width={76} />
        <span className="sx">×</span>
        <Field label="Height or depth in mm" value={spec.H} original={base.H} onChange={(v) => onChange(withDimension(record, spec, 'H', num(v)))} suffix="mm" width={76} />
        {area && <span className="sa">{fmtNum(area, 2)} m²</span>}
      </SpecRow>
      <SpecRow k="Location">
        <Field type="text" label="Location" value={spec.location} original={base.location} onChange={(v) => onChange({ ...spec, location: v })} width={210} />
      </SpecRow>
      <SpecRow k="Lot">
        <Field type="text" label="Lot" value={spec.lotto} original={base.lotto} onChange={(v) => onChange({ ...spec, lotto: v })} width={110} />
      </SpecRow>
      <SpecRow k="Unit weight">
        <Field label="Unit weight in kg" value={spec.weightKg} original={base.weightKg} onChange={(v) => onChange({ ...spec, weightKg: num(v), weightManual: true })} suffix="kg" />
        {!spec.weightManual && spec.weightKg !== base.weightKg && <span className="sa">estimated from size</span>}
      </SpecRow>
      <SpecRow k="Quantity">
        <Field label="Quantity" value={spec.quantity} original={base.quantity} onChange={(v) => onChange({ ...spec, quantity: Number(v) || 0 })} suffix={record.unit ?? 'units'} />
      </SpecRow>
      {others.map((p) => {
        const value = spec.params.find((x) => x.cell === p.cell)?.value ?? null;
        const numeric = typeof p.value === 'number';
        return (
          <SpecRow key={p.cell} k={p.label.charAt(0) + p.label.slice(1).toLowerCase()}>
            <Field type={numeric ? 'number' : 'text'} label={p.label} value={value} original={p.value} onChange={(v) => onChange({ ...spec, params: spec.params.map((x) => (x.cell === p.cell ? { ...x, value: numeric ? num(v) : v } : x)) })} suffix={p.unit?.toLowerCase() ?? undefined} />
          </SpecRow>
        );
      })}
      {fixed.slice(1).map(([k, v]) => (
        <SpecRow key={k} k={k}>
          {v}
        </SpecRow>
      ))}
    </dl>
  );
}

function SpecRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </>
  );
}
