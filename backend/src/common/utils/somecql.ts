/**
 * SomecQL: a small pipe query language the assistant writes instead of reading raw records.
 * The model sends one short query; the server returns only the result rows (capped), which
 * keeps prompts small and every figure exact.
 *
 *   lines | where year = 2026 and customer = "ACME" | group category | agg sum(total), count() | sort sum_total desc | limit 5
 *
 * Stages (in any order after the dataset, each at most once except where):
 *   <dataset>                 lines | quotations | products
 *   where <cond> [and|or <cond>] field op value (and binds tighter than or); ops = != > >= < <= ~ (contains, case-insensitive) in (a, b)
 *   group <field>[, field]    group rows; combine with agg. bucket(field, size) groups numbers into ranges (histograms)
 *   agg fn(field)[, ...]      sum avg min max count; output columns are fn_field (count() -> count)
 *   select f1, f2             columns to return (without group)
 *   sort <column> [asc|desc]
 *   limit <n>                 default 20, max 50
 */
export type Row = Record<string, string | number | null>;
export type Dataset = Record<string, Row[]>;

export interface QueryResult {
  columns: string[];
  rows: Row[];
  total: number;
}

type Cond = { field: string; op: string; value: string | number | Array<string | number> };
const AGG = new Set(['sum', 'avg', 'min', 'max', 'count']);

function parseValue(raw: string): string | number {
  const t = raw.trim();
  if (/^".*"$|^'.*'$/.test(t)) return t.slice(1, -1);
  const n = Number(t);
  return t !== '' && !Number.isNaN(n) ? n : t;
}

function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = '';
  let depth = 0;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth--;
      cur += ch;
    } else if (depth === 0 && ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseCond(text: string, fields: Set<string>): Cond {
  const m = /^([a-z_]+)\s*(!=|>=|<=|=|>|<|~|\bin\b)\s*(.+)$/i.exec(text.trim());
  if (!m) throw new Error(`Cannot read condition "${text}". Use field op value, e.g. year = 2026`);
  const field = m[1].toLowerCase();
  if (!fields.has(field)) throw new Error(`Unknown field "${field}". Fields: ${[...fields].join(', ')}`);
  const op = m[2].toLowerCase();
  if (op === 'in') {
    const inner = m[3].trim().replace(/^[([]|[)\]]$/g, '');
    return { field, op, value: splitTop(inner, ',').map(parseValue) };
  }
  return { field, op, value: parseValue(m[3]) };
}

function test(row: Row, c: Cond): boolean {
  const v = row[c.field];
  if (c.op === 'in') return (c.value as Array<string | number>).some((x) => String(x).toLowerCase() === String(v ?? '').toLowerCase());
  if (c.op === '~') return String(v ?? '').toLowerCase().includes(String(c.value).toLowerCase());
  if (c.op === '=' || c.op === '!=') {
    const eq = typeof c.value === 'number' && typeof v === 'number' ? v === c.value : String(v ?? '').toLowerCase() === String(c.value).toLowerCase();
    return c.op === '=' ? eq : !eq;
  }
  if (v === null || v === undefined) return false;
  const a = typeof c.value === 'number' ? Number(v) : String(v);
  const b = c.value as string | number;
  return c.op === '>' ? a > b : c.op === '>=' ? a >= b : c.op === '<' ? a < b : a <= b;
}

const round = (n: number): number => Math.round(n * 100) / 100;

export function runQuery(query: string, data: Dataset): QueryResult {
  const stages = splitTop(query.replace(/\n/g, ' '), '|');
  if (!stages.length) throw new Error('Empty query');
  const dataset = stages[0].toLowerCase();
  const source = data[dataset];
  if (!source) throw new Error(`Unknown dataset "${stages[0]}". Use one of: ${Object.keys(data).join(', ')}`);
  const fields = new Set(source.length ? Object.keys(source[0]) : []);

  const anyOf: Cond[][] = [];
  let group: string[] = [];
  const buckets: Record<string, number> = {};
  let aggs: Array<{ fn: string; field: string; name: string }> = [];
  let select: string[] = [];
  let sort: { col: string; dir: 1 | -1 } | null = null;
  let limit = 20;

  for (const stage of stages.slice(1)) {
    const [kw, ...rest] = stage.split(/\s+/);
    const body = stage.slice(kw.length).trim();
    switch (kw.toLowerCase()) {
      case 'where':
        // a or b and c  ==  a OR (b AND c); brackets are only grouping noise for this grammar
        // a or b and c  ==  a OR (b AND c). Keep in-lists, drop other brackets (grouping noise for this grammar).
        for (const alt of body.replace(/\bin\s*\(([^)]*)\)/gi, 'in [$1]').replace(/[()]/g, ' ').split(/\s+or\s+/i)) {
          anyOf.push(alt.split(/\s+and\s+/i).map((part) => parseCond(part, fields)));
        }
        break;
      case 'group':
        group = splitTop(body.replace(/^by\s+/i, ''), ',').map((f) => {
          const b = /^bucket\(\s*([a-z_]+)\s*,\s*([\d.]+)\s*\)$/i.exec(f.trim());
          if (!b) return f.trim().toLowerCase();
          const field = b[1].toLowerCase();
          if (!fields.has(field)) throw new Error(`Unknown field "${field}" in bucket()`);
          buckets[`${field}_range`] = Number(b[2]) || 1;
          return `${field}_range`;
        });
        for (const f of group) if (!fields.has(f) && !(f in buckets)) throw new Error(`Unknown group field "${f}". Fields: ${[...fields].join(', ')}`);
        break;
      case 'agg':
        aggs = splitTop(body, ',').map((a) => {
          const m = /^([a-z]+)\(\s*([a-z_]*)\s*\)$/i.exec(a.trim());
          if (!m || !AGG.has(m[1].toLowerCase())) throw new Error(`Cannot read aggregate "${a}". Use sum(field), avg(field), min(field), max(field) or count()`);
          const fn = m[1].toLowerCase();
          const field = m[2].toLowerCase();
          if (fn !== 'count' && !fields.has(field)) throw new Error(`Unknown field "${field}" in ${fn}()`);
          return { fn, field, name: fn === 'count' ? 'count' : `${fn}_${field}` };
        });
        break;
      case 'select':
        select = body.split(',').map((f) => f.trim().toLowerCase());
        for (const f of select) if (!fields.has(f)) throw new Error(`Unknown field "${f}". Fields: ${[...fields].join(', ')}`);
        break;
      case 'sort': {
        const [col, dir] = rest;
        sort = { col: (col ?? '').toLowerCase(), dir: dir?.toLowerCase() === 'asc' ? 1 : -1 };
        break;
      }
      case 'limit':
        limit = Math.max(1, Math.min(50, Number(rest[0]) || 20));
        break;
      default:
        throw new Error(`Unknown stage "${kw}". Stages: where, group, agg, select, sort, limit`);
    }
  }

  let rows = anyOf.length ? source.filter((r) => anyOf.some((all) => all.every((c) => test(r, c)))) : source;
  if (group.length || aggs.length) {
    if (!aggs.length) aggs = [{ fn: 'count', field: '', name: 'count' }];
    const bucketOf = (g: string, r: Row): string | null => {
      const v = r[g.replace(/_range$/, '')];
      if (typeof v !== 'number') return null;
      const size = buckets[g];
      const lo = Math.floor(v / size) * size;
      return `${lo}–${lo + size}`;
    };
    const grouped = new Map<string, Row[]>();
    for (const r of rows) {
      const key = JSON.stringify(group.map((g) => (g in buckets ? bucketOf(g, r) : r[g])));
      grouped.set(key, [...(grouped.get(key) ?? []), r]);
    }
    rows = [...grouped.entries()].map(([key, members]) => {
      const out: Row = {};
      (JSON.parse(key) as Array<string | number | null>).forEach((v, i) => (out[group[i]] = v));
      for (const a of aggs) {
        const nums = members.map((m) => m[a.field]).filter((v): v is number => typeof v === 'number');
        out[a.name] =
          a.fn === 'count' ? members.length : !nums.length ? null : a.fn === 'sum' ? round(nums.reduce((s, n) => s + n, 0)) : a.fn === 'avg' ? round(nums.reduce((s, n) => s + n, 0) / nums.length) : a.fn === 'min' ? round(Math.min(...nums)) : round(Math.max(...nums));
      }
      return out;
    });
  } else if (select.length) {
    rows = rows.map((r) => Object.fromEntries(select.map((f) => [f, r[f]])));
  }
  const bucketCol = group.find((g) => g in buckets);
  if (!sort && bucketCol) rows = [...rows].sort((a, b) => parseFloat(String(a[bucketCol])) - parseFloat(String(b[bucketCol])));
  if (sort) {
    const s = sort;
    if (rows.length && !(s.col in rows[0])) throw new Error(`Cannot sort by "${s.col}". Columns: ${Object.keys(rows[0]).join(', ')}`);
    const byRange = s.col in buckets; // "1000–1200" must follow "800–1000", not "1000" < "200" as text
    rows = [...rows].sort((a, b) => {
      const x = byRange ? parseFloat(String(a[s.col])) : a[s.col];
      const y = byRange ? parseFloat(String(b[s.col])) : b[s.col];
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * s.dir;
    });
  }
  const total = rows.length;
  rows = rows.slice(0, limit);
  return { columns: rows.length ? Object.keys(rows[0]) : [], rows, total };
}
