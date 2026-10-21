import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, fmtMoney, type CatalogRecord } from '../api';
import { cleanTitle, dims, imageOf, isProduct, sourceOf, typologyOf, TYPOLOGIES, type Typology } from '../product';
import { navigate } from '../route';

interface Props {
  q: string;
  setQ: (q: string) => void;
  busy: boolean;
  onSubmit: (q: string) => void;
  onTypology: (key: string) => void;
}

const POPULAR = ['glass windscreen h2000', 'divider with door', 'prefabricated balcony', 'teak decking', 'glass sliding door', 'aluminium handrail'];

type Item = { kind: 'query'; text: string } | { kind: 'typology'; t: Typology } | { kind: 'product'; r: CatalogRecord };

/** Bold the parts of the text that match a typed word. */
function highlight(text: string, q: string): ReactNode {
  const words = q.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join('|')})`, 'gi')).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export function SearchSuggest({ q, setQ, busy, onSubmit, onTypology }: Props) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<CatalogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return setProducts([]);
    const id = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(query, { limit: 40 })
        .then((res) => {
          if (id !== seq.current) return;
          const seen = new Set<string>();
          setProducts(
            res.hits
              .map((h) => h.record)
              .filter((r) => r.sheet && isProduct(r) && !seen.has(cleanTitle(r)) && seen.add(cleanTitle(r)))
              .slice(0, 6),
          );
        })
        .catch(() => undefined)
        .finally(() => id === seq.current && setLoading(false));
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  const query = q.trim().toLowerCase();
  const typologies =
    query.length < 2
      ? []
      : TYPOLOGIES.filter((t) => query.split(/\s+/).some((w) => w.length > 2 && (t.label.toLowerCase().includes(w) || t.test.test(w))))
          .concat(products.map(typologyOf))
          .filter((t, i, a) => a.findIndex((x) => x.key === t.key) === i)
          .slice(0, 3);
  const items: Item[] = query.length < 2 ? POPULAR.map((text) => ({ kind: 'query', text })) : [...typologies.map((t): Item => ({ kind: 'typology', t })), ...products.map((r): Item => ({ kind: 'product', r }))];

  const choose = (it: Item | undefined): void => {
    setOpen(false);
    setActive(-1);
    if (!it) return onSubmit(q);
    if (it.kind === 'query') {
      setQ(it.text);
      onSubmit(it.text);
    } else if (it.kind === 'typology') onTypology(it.t.key);
    else navigate({ page: 'product', id: it.r.id });
  };

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Escape') setOpen(false);
  };

  let idx = -1;
  const row = (it: Item, body: ReactNode, key: string): ReactNode => {
    idx += 1;
    const i = idx;
    return (
      <li key={key} role="option" aria-selected={active === i} className={`sg-row ${active === i ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(it)}>
        {body}
      </li>
    );
  };

  return (
    <div className="sg-wrap">
      <form
        className="hero-search"
        onSubmit={(e) => {
          e.preventDefault();
          choose(active >= 0 ? items[active] : undefined);
        }}
      >
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
          placeholder="Try “glass windscreen 2000 high”, “teak decking”, “divider with door”…"
          aria-label="search products"
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
        />
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Search'}
        </button>
      </form>
      {open && (items.length > 0 || loading) && (
        <ul className="sg" role="listbox">
          {query.length < 2 && <li className="sg-head">Popular searches</li>}
          {items.map((it) => {
            if (it.kind === 'query') return row(it, <><span className="sg-icon">⌕</span><span>{it.text}</span></>, `q-${it.text}`);
            if (it.kind === 'typology')
              return row(it, <><span className="sg-icon">▦</span><span>Browse all <b>{it.t.label}</b></span><span className="sg-tag">category</span></>, `t-${it.t.key}`);
            const r = it.r;
            return row(
              it,
              <>
                <span className="sg-thumb" style={{ backgroundImage: `url(${imageOf(r)})` }} />
                <span className="sg-main">
                  <span className="sg-title">{highlight(cleanTitle(r), q)}</span>
                  <span className="sg-sub">
                    {typologyOf(r).label} · {sourceOf(r)}
                    {dims(r) ? ` · ${dims(r)}` : ''}
                  </span>
                </span>
                <span className="sg-price">
                  {fmtMoney(r.unitCost)}
                  <small>/{r.unit ?? 'unit'}</small>
                </span>
              </>,
              `p-${r.id}`,
            );
          })}
          {query.length >= 2 && products.length > 0 && (
            <li className="sg-foot" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(undefined)}>
              See all results for “{q.trim()}” ↵
            </li>
          )}
          {loading && products.length === 0 && <li className="sg-head">Searching…</li>}
        </ul>
      )}
    </div>
  );
}
