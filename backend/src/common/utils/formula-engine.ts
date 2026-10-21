/**
 * Excel formula engine for the subset used by the Somec analysis sheets
 * (census over 587 tabs / 2.58 M formulas: IF, VLOOKUP, IFERROR, SUMIF, SUM, INT,
 * CEILING, INDIRECT, CELL, ROUND, CONCATENATE, OR, MID, FIND, VALUE, TRIM, COUNTIFS,
 * COUNTIF, RIGHT, SUMPRODUCT, LEFT, PRODUCT, FLOOR, AND, MAX, TRUNC, FLOOR.MATH;
 * operators + - * / ^ & = <> < > <= >= and unary minus/percent).
 *
 * Cells and ranges are resolved through an EvalContext so the same engine can run
 * on a stored cell map (database) instead of the workbook. Excel coercion rules are
 * followed where they matter for these sheets: blank = 0 / "", text in arithmetic
 * is #VALUE! unless numeric, comparisons are type-ordered, errors propagate and
 * IFERROR catches them.
 */
import { colToNum, numToCol } from './a1';

export type ErrorCode = '#N/A' | '#VALUE!' | '#REF!' | '#DIV/0!' | '#NAME?' | '#NUM!' | '#NULL!';

export class ExcelError {
  constructor(readonly code: ErrorCode) {}
  toString(): string {
    return this.code;
  }
}

export type Value = number | string | boolean | null | ExcelError;

export interface CellRef {
  sheet: string | null;
  col: number;
  row: number;
}

export interface RangeRef {
  sheet: string | null;
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

export interface EvalContext {
  /** Value of a cell (formulas already evaluated by the context). Blank cells return null. */
  getCell(sheet: string | null, col: number, row: number): Value;
  /** Row numbers to visit for a range (whole-column ranges must be bounded by the context). */
  rangeRows(sheet: string | null, c1: number, c2: number, r1: number, r2: number): number[];
  /** Exact-match lookup in a column (optional index); undefined = not indexed, scan instead. */
  findRow?(sheet: string | null, col: number, r1: number, r2: number, key: Value): number | null | undefined;
  /** For CELL("FILENAME"): the bracketed workbook name and the current sheet name. */
  fileName: string;
  sheetName: string;
}

// ---------------------------------------------------------------- tokenizer

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'err'; v: ErrorCode }
  | { t: 'op'; v: string }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' }
  | { t: ','; v: ',' }
  | { t: 'end'; v: '' };

const REF_RE = /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(?:\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?\d+:\$?\d+)(?![\w(])/;
const EXT_REF_RE = /^\[\d+\][^!]*![^,)]+/; // external workbook ref -> #REF!

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (ch === '#') {
      const m = /^#(N\/A|VALUE!|REF!|DIV\/0!|NAME\?|NUM!|NULL!)/.exec(src.slice(i));
      if (m) {
        out.push({ t: 'err', v: ('#' + m[1]) as ErrorCode });
        i += m[0].length;
        continue;
      }
    }
    const ext = EXT_REF_RE.exec(src.slice(i));
    if (ext) {
      out.push({ t: 'err', v: '#REF!' });
      i += ext[0].length;
      continue;
    }
    const ref = REF_RE.exec(src.slice(i));
    if (ref) {
      out.push({ t: 'ref', v: ref[0] });
      i += ref[0].length;
      continue;
    }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][\w.]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0].toUpperCase() });
      i += id[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>%])/.exec(src.slice(i));
    if (op) {
      out.push({ t: 'op', v: op[0] });
      i += op[0].length;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      out.push({ t: ch, v: ch } as Tok);
      i++;
      continue;
    }
    if (ch === ';') {
      out.push({ t: ',', v: ',' });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${ch}' at ${i} in formula: ${src}`);
  }
  out.push({ t: 'end', v: '' });
  return out;
}

// ---------------------------------------------------------------- parser (Pratt)

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: ErrorCode }
  | { k: 'cell'; ref: CellRef }
  | { k: 'range'; ref: RangeRef }
  | { k: 'un'; op: '-' | '+' | '%'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

const PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

function unquoteSheet(s: string): string {
  return s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
}

export function parseRef(text: string): CellRef | RangeRef {
  const bang = text.lastIndexOf('!');
  const sheet = bang >= 0 ? unquoteSheet(text.slice(0, bang)) : null;
  const body = text.slice(bang + 1).replace(/\$/g, '');
  const colRange = /^([A-Z]{1,3}):([A-Z]{1,3})$/.exec(body);
  if (colRange) return { sheet, c1: colToNum(colRange[1]), r1: 1, c2: colToNum(colRange[2]), r2: Number.POSITIVE_INFINITY };
  const rowRange = /^(\d+):(\d+)$/.exec(body);
  if (rowRange) return { sheet, c1: 1, r1: Number(rowRange[1]), c2: Number.POSITIVE_INFINITY, r2: Number(rowRange[2]) };
  const parts = body.split(':');
  const a = /^([A-Z]{1,3})(\d+)$/.exec(parts[0])!;
  if (parts.length === 1) return { sheet, col: colToNum(a[1]), row: Number(a[2]) };
  const b = /^([A-Z]{1,3})(\d+)$/.exec(parts[1])!;
  const c1 = colToNum(a[1]);
  const c2 = colToNum(b[1]);
  const r1 = Number(a[2]);
  const r2 = Number(b[2]);
  return { sheet, c1: Math.min(c1, c2), r1: Math.min(r1, r2), c2: Math.max(c1, c2), r2: Math.max(r1, r2) };
}

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.i];
  }
  private next(): Tok {
    return this.toks[this.i++];
  }

  parse(): Node {
    const n = this.expr(0);
    if (this.peek().t !== 'end') throw new Error(`Unexpected token ${JSON.stringify(this.peek())}`);
    return n;
  }

  private expr(minPrec: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t === 'op' && t.v === '%') {
        this.next();
        left = { k: 'un', op: '%', a: left };
        continue;
      }
      if (t.t !== 'op' || !(t.v in PREC) || PREC[t.v] < minPrec) break;
      this.next();
      const prec = PREC[t.v];
      const right = this.expr(t.v === '^' ? prec : prec + 1);
      left = { k: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }

  private unary(): Node {
    const t = this.peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) {
      this.next();
      return { k: 'un', op: t.v, a: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.next();
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v };
      case 'str':
        return { k: 'str', v: t.v };
      case 'err':
        return { k: 'err', v: t.v };
      case 'ref': {
        const r = parseRef(t.v);
        return 'col' in r ? { k: 'cell', ref: r } : { k: 'range', ref: r };
      }
      case 'id': {
        if (t.v === 'TRUE') return { k: 'bool', v: true };
        if (t.v === 'FALSE') return { k: 'bool', v: false };
        if (this.peek().t !== '(') throw new Error(`Unknown name ${t.v}`);
        this.next();
        const args: Node[] = [];
        if (this.peek().t !== ')') {
          for (;;) {
            if (this.peek().t === ',') {
              args.push({ k: 'num', v: 0 }); // omitted argument
            } else args.push(this.expr(0));
            if (this.peek().t === ',') {
              this.next();
              continue;
            }
            break;
          }
        }
        if (this.next().t !== ')') throw new Error(`Expected ) after arguments of ${t.v}`);
        return { k: 'call', fn: t.v, args };
      }
      case '(': {
        const n = this.expr(0);
        if (this.next().t !== ')') throw new Error('Expected )');
        return n;
      }
      default:
        throw new Error(`Unexpected token ${JSON.stringify(t)}`);
    }
  }
}

const parseCache = new Map<string, Node>();

export function parseFormula(src: string): Node {
  let n = parseCache.get(src);
  if (!n) {
    n = new Parser(tokenize(src.replace(/^=/, ''))).parse();
    parseCache.set(src, n);
  }
  return n;
}

// ---------------------------------------------------------------- evaluation helpers

const isErr = (v: unknown): v is ExcelError => v instanceof ExcelError;
const E = (code: ErrorCode): ExcelError => new ExcelError(code);

/** Numeric coercion for arithmetic: blank -> 0, bool -> 0/1, numeric text -> number, other text -> #VALUE!. */
function toNum(v: Value): number | ExcelError {
  if (isErr(v)) return v;
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = v.trim();
  if (s === '') return E('#VALUE!');
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : E('#VALUE!');
}

function toStr(v: Value): string | ExcelError {
  if (isErr(v)) return v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return numToText(v);
  return v;
}

function numToText(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(15)));
}

function toBool(v: Value): boolean | ExcelError {
  if (isErr(v)) return v;
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = v.trim().toUpperCase();
  if (s === 'TRUE') return true;
  if (s === 'FALSE') return false;
  return E('#VALUE!');
}

/** Excel comparison: numbers < text < booleans; blank equals 0 and "". Returns -1/0/1. */
function compare(a: Value, b: Value): number {
  const rank = (v: Value): number => (typeof v === 'boolean' ? 2 : typeof v === 'string' ? 1 : 0);
  const na = a === null ? (typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0) : a;
  const nb = b === null ? (typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0) : b;
  const ra = rank(na);
  const rb = rank(nb);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (typeof na === 'string' && typeof nb === 'string') {
    const x = na.toLowerCase();
    const y = nb.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = Number(na);
  const y = Number(nb);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** SUMIF/COUNTIF criteria: a value (equality) or ">0", "<>", "<=5", text with wildcards * ?. */
function criteriaMatcher(crit: Value): (v: Value) => boolean {
  if (typeof crit === 'string') {
    const m = /^(<>|<=|>=|=|<|>)(.*)$/.exec(crit);
    if (m) {
      const op = m[1];
      const rhsText = m[2];
      const rhsNum = rhsText.trim() === '' ? null : Number(rhsText);
      const rhs: Value = rhsText.trim() === '' ? null : Number.isFinite(rhsNum) ? rhsNum : rhsText;
      return (v) => {
        if (rhs === null) return op === '<>' ? v !== null && v !== '' : v === null || v === '';
        if (isErr(v)) return false;
        if (typeof rhs === 'string') {
          if (typeof v !== 'string') return op === '<>';
          const c = compare(v, rhs);
          return op === '=' ? c === 0 : op === '<>' ? c !== 0 : op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
        }
        if (typeof v !== 'number') return op === '<>';
        return op === '=' ? v === rhs : op === '<>' ? v !== rhs : op === '<' ? v < rhs : op === '>' ? v > rhs : op === '<=' ? v <= rhs : v >= rhs;
      };
    }
    if (/[*?]/.test(crit)) {
      const re = new RegExp('^' + crit.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      return (v) => typeof v === 'string' && re.test(v);
    }
    const n = crit.trim() === '' ? null : Number(crit);
    if (crit.trim() !== '' && Number.isFinite(n)) return (v) => (typeof v === 'number' && v === n) || (typeof v === 'string' && v.trim() !== '' && Number(v) === n);
    const low = crit.toLowerCase();
    return (v) => (crit === '' ? v === null || v === '' : typeof v === 'string' && v.toLowerCase() === low);
  }
  if (crit === null) return (v) => v === null || v === '' || v === 0;
  if (typeof crit === 'number') return (v) => (typeof v === 'number' && v === crit) || (typeof v === 'string' && v.trim() !== '' && Number(v) === crit);
  if (typeof crit === 'boolean') return (v) => v === crit;
  return () => false;
}

function roundHalfAway(x: number, digits: number): number {
  const f = 10 ** digits;
  const y = Math.abs(x) * f;
  const r = Math.floor(y + 0.5 + 1e-9) / f;
  return x < 0 ? -r : r;
}

// ---------------------------------------------------------------- evaluator

export class Evaluator {
  constructor(private readonly ctx: EvalContext) {}

  eval(n: Node): Value {
    switch (n.k) {
      case 'num':
        return n.v;
      case 'str':
        return n.v;
      case 'bool':
        return n.v;
      case 'err':
        return E(n.v);
      case 'cell':
        return this.ctx.getCell(n.ref.sheet, n.ref.col, n.ref.row);
      case 'range':
        return E('#VALUE!'); // a bare range in scalar position
      case 'un': {
        const a = this.eval(n.a);
        if (n.op === '%') {
          const x = toNum(a);
          return isErr(x) ? x : x / 100;
        }
        const x = toNum(a);
        return isErr(x) ? x : n.op === '-' ? -x : x;
      }
      case 'bin':
        return this.binary(n.op, this.eval(n.a), this.eval(n.b));
      case 'call':
        return this.call(n.fn, n.args);
    }
  }

  private binary(op: string, a: Value, b: Value): Value {
    if (isErr(a)) return a;
    if (isErr(b)) return b;
    switch (op) {
      case '&': {
        const x = toStr(a);
        const y = toStr(b);
        return isErr(x) ? x : isErr(y) ? y : x + y;
      }
      case '=':
        return compare(a, b) === 0;
      case '<>':
        return compare(a, b) !== 0;
      case '<':
        return compare(a, b) < 0;
      case '>':
        return compare(a, b) > 0;
      case '<=':
        return compare(a, b) <= 0;
      case '>=':
        return compare(a, b) >= 0;
    }
    const x = toNum(a);
    const y = toNum(b);
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    switch (op) {
      case '+':
        return x + y;
      case '-':
        return x - y;
      case '*':
        return x * y;
      case '/':
        return y === 0 ? E('#DIV/0!') : x / y;
      case '^':
        return Math.pow(x, y);
    }
    return E('#NAME?');
  }

  /** Rows to visit for a range: the full rectangle when bounded (positions matter for SUMPRODUCT / paired ranges), existing rows otherwise. */
  private rowsOf(r: RangeRef): number[] {
    const bounded = Number.isFinite(r.r1) && Number.isFinite(r.r2) && (r.r2 - r.r1 + 1) * (Math.min(r.c2, r.c1 + 50) - r.c1 + 1) <= 200_000;
    if (!bounded) return this.ctx.rangeRows(r.sheet, r.c1, r.c2, r.r1, r.r2);
    const out: number[] = [];
    for (let row = r.r1; row <= r.r2; row++) out.push(row);
    return out;
  }

  /** Values of a range node (or a single cell) as a flat list in row-major order (blank cells as null). */
  private rangeValues(n: Node): Value[] | ExcelError {
    if (n.k === 'cell') return [this.eval(n)];
    if (n.k !== 'range') {
      const v = this.eval(n);
      return isErr(v) ? v : [v];
    }
    const r = n.ref;
    const out: Value[] = [];
    for (const row of this.rowsOf(r)) {
      for (let c = r.c1; c <= Math.min(r.c2, r.c1 + 50); c++) out.push(this.ctx.getCell(r.sheet, c, row));
    }
    return out;
  }

  private numArgs(args: Node[]): number[] | ExcelError {
    const out: number[] = [];
    for (const a of args) {
      const vals = this.rangeValues(a);
      if (isErr(vals)) return vals;
      for (const v of vals) {
        if (a.k === 'range') {
          if (typeof v === 'number') out.push(v);
        } else {
          const x = toNum(v);
          if (isErr(x)) return x;
          out.push(x);
        }
      }
    }
    return out;
  }

  private call(fn: string, args: Node[]): Value {
    const arg = (i: number): Value => (i < args.length ? this.eval(args[i]) : null);
    const num = (i: number): number | ExcelError => toNum(arg(i));
    switch (fn) {
      case 'IF': {
        const c = toBool(arg(0));
        if (isErr(c)) return c;
        if (c) return args.length > 1 ? this.eval(args[1]) : true;
        return args.length > 2 ? this.eval(args[2]) : false;
      }
      case 'IFERROR': {
        const v = this.eval(args[0]);
        return isErr(v) ? this.eval(args[1]) : v;
      }
      case 'AND':
      case 'OR': {
        let acc = fn === 'AND';
        for (const a of args) {
          const vals = this.rangeValues(a);
          if (isErr(vals)) return vals;
          for (const v of vals) {
            if (typeof v === 'string' && a.k === 'range') continue;
            const b = toBool(v);
            if (isErr(b)) return b;
            acc = fn === 'AND' ? acc && b : acc || b;
          }
        }
        return acc;
      }
      case 'NOT': {
        const b = toBool(arg(0));
        return isErr(b) ? b : !b;
      }
      case 'SUM': {
        const xs = this.numArgs(args);
        return isErr(xs) ? xs : xs.reduce((s, x) => s + x, 0);
      }
      case 'PRODUCT': {
        const xs = this.numArgs(args);
        return isErr(xs) ? xs : xs.reduce((s, x) => s * x, 1);
      }
      case 'MAX': {
        const xs = this.numArgs(args);
        return isErr(xs) ? xs : xs.length ? Math.max(...xs) : 0;
      }
      case 'MIN': {
        const xs = this.numArgs(args);
        return isErr(xs) ? xs : xs.length ? Math.min(...xs) : 0;
      }
      case 'ABS': {
        const x = num(0);
        return isErr(x) ? x : Math.abs(x);
      }
      case 'INT': {
        const x = num(0);
        return isErr(x) ? x : Math.floor(x);
      }
      case 'TRUNC': {
        const x = num(0);
        const d = args.length > 1 ? num(1) : 0;
        if (isErr(x)) return x;
        if (isErr(d)) return d;
        const f = 10 ** d;
        return Math.trunc(x * f) / f;
      }
      case 'ROUND': {
        const x = num(0);
        const d = args.length > 1 ? num(1) : 0;
        if (isErr(x)) return x;
        if (isErr(d)) return d;
        return roundHalfAway(x, d);
      }
      case 'CEILING':
      case 'CEILING.MATH': {
        const x = num(0);
        const s = args.length > 1 ? num(1) : 1;
        if (isErr(x)) return x;
        if (isErr(s)) return s;
        if (s === 0) return 0;
        if (fn === 'CEILING' && x > 0 && s < 0) return E('#NUM!');
        const sig = Math.abs(s);
        const q = Math.ceil(Math.abs(x) / sig - 1e-12) * sig;
        return x < 0 ? -q : q;
      }
      case 'FLOOR':
      case 'FLOOR.MATH': {
        const x = num(0);
        const s = args.length > 1 ? num(1) : 1;
        if (isErr(x)) return x;
        if (isErr(s)) return s;
        if (s === 0) return fn === 'FLOOR' ? E('#DIV/0!') : 0;
        const sig = Math.abs(s);
        const q = Math.floor(Math.abs(x) / sig + 1e-12) * sig;
        return x < 0 ? -q : q;
      }
      case 'VALUE': {
        const s = toStr(arg(0));
        if (isErr(s)) return s;
        const n = Number(s.trim().replace(',', '.'));
        return s.trim() !== '' && Number.isFinite(n) ? n : E('#VALUE!');
      }
      case 'TRIM': {
        const s = toStr(arg(0));
        return isErr(s) ? s : s.replace(/\s+/g, ' ').trim();
      }
      case 'UPPER': {
        const s = toStr(arg(0));
        return isErr(s) ? s : s.toUpperCase();
      }
      case 'LEN': {
        const s = toStr(arg(0));
        return isErr(s) ? s : s.length;
      }
      case 'LEFT':
      case 'RIGHT': {
        const s = toStr(arg(0));
        const n = args.length > 1 ? num(1) : 1;
        if (isErr(s)) return s;
        if (isErr(n)) return n;
        const k = Math.max(0, Math.floor(n));
        return fn === 'LEFT' ? s.slice(0, k) : k === 0 ? '' : s.slice(-k);
      }
      case 'MID': {
        const s = toStr(arg(0));
        const start = num(1);
        const n = num(2);
        if (isErr(s)) return s;
        if (isErr(start)) return start;
        if (isErr(n)) return n;
        if (start < 1 || n < 0) return E('#VALUE!');
        return s.slice(Math.floor(start) - 1, Math.floor(start) - 1 + Math.floor(n));
      }
      case 'FIND': {
        const f = toStr(arg(0));
        const w = toStr(arg(1));
        const start = args.length > 2 ? num(2) : 1;
        if (isErr(f)) return f;
        if (isErr(w)) return w;
        if (isErr(start)) return start;
        const idx = w.indexOf(f, Math.max(0, Math.floor(start) - 1));
        return idx < 0 ? E('#VALUE!') : idx + 1;
      }
      case 'CONCATENATE': {
        let s = '';
        for (let i = 0; i < args.length; i++) {
          const t = toStr(arg(i));
          if (isErr(t)) return t;
          s += t;
        }
        return s;
      }
      case 'CELL': {
        const what = toStr(arg(0));
        if (isErr(what)) return what;
        if (what.toLowerCase() === 'filename') return `/[${this.ctx.fileName}]${this.ctx.sheetName}`;
        return E('#VALUE!');
      }
      case 'INDIRECT': {
        const text = toStr(arg(0));
        if (isErr(text)) return text;
        let ref: CellRef | RangeRef;
        try {
          ref = parseRef(text.trim());
        } catch {
          return E('#REF!');
        }
        if ('col' in ref) return this.ctx.getCell(ref.sheet, ref.col, ref.row);
        return E('#VALUE!');
      }
      case 'VLOOKUP': {
        const key = arg(0);
        if (isErr(key)) return key;
        if (args[1].k !== 'range') return E('#REF!');
        const r = args[1].ref;
        const colIndex = num(2);
        if (isErr(colIndex)) return colIndex;
        const exact = args.length > 3 ? toBool(arg(3)) : true;
        if (isErr(exact)) return exact;
        if (colIndex < 1 || r.c1 + colIndex - 1 > r.c2) return E('#REF!');
        if (!exact) {
          const indexed = this.ctx.findRow?.(r.sheet, r.c1, r.r1, r.r2, key);
          if (indexed === null) return E('#N/A');
          if (typeof indexed === 'number') return this.ctx.getCell(r.sheet, r.c1 + colIndex - 1, indexed);
          for (const row of this.ctx.rangeRows(r.sheet, r.c1, r.c1, r.r1, r.r2)) {
            if (compare(this.ctx.getCell(r.sheet, r.c1, row), key) === 0 && this.ctx.getCell(r.sheet, r.c1, row) !== null) {
              return this.ctx.getCell(r.sheet, r.c1 + colIndex - 1, row);
            }
          }
          return E('#N/A');
        }
        // approximate match: last row whose first column <= key (assumes sorted)
        let best: number | null = null;
        for (const row of this.ctx.rangeRows(r.sheet, r.c1, r.c1, r.r1, r.r2)) {
          const v = this.ctx.getCell(r.sheet, r.c1, row);
          if (v === null) continue;
          if (compare(v, key) <= 0) best = row;
          else break;
        }
        return best === null ? E('#N/A') : this.ctx.getCell(r.sheet, r.c1 + colIndex - 1, best);
      }
      case 'SUMIF':
      case 'COUNTIF': {
        if (args[0].k !== 'range') return E('#VALUE!');
        const r = args[0].ref;
        const match = criteriaMatcher(arg(1));
        const rows = this.ctx.rangeRows(r.sheet, r.c1, r.c2, r.r1, r.r2);
        const sumRange = fn === 'SUMIF' && args.length > 2 && args[2].k === 'range' ? args[2].ref : r;
        if (fn === 'COUNTIF' && Number.isFinite(r.r1) && Number.isFinite(r.r2)) {
          // blank cells count for criteria like "" or "<>"
          const matchBlank = match(null);
          const present = new Set(rows);
          let blanks = 0;
          if (matchBlank) for (let row = r.r1; row <= r.r2; row++) if (!present.has(row)) blanks += r.c2 - r.c1 + 1;
          let acc = blanks;
          for (const row of rows) for (let c = r.c1; c <= r.c2; c++) if (match(this.ctx.getCell(r.sheet, c, row))) acc++;
          return acc;
        }
        let acc = 0;
        for (const row of rows) {
          for (let c = r.c1; c <= r.c2; c++) {
            if (!match(this.ctx.getCell(r.sheet, c, row))) continue;
            if (fn === 'COUNTIF') acc++;
            else {
              const v = this.ctx.getCell(sumRange.sheet, sumRange.c1 + (c - r.c1), sumRange.r1 + (row - r.r1));
              if (typeof v === 'number') acc += v;
            }
          }
        }
        return acc;
      }
      case 'COUNTIFS': {
        if (args.length < 2 || args[0].k !== 'range') return E('#VALUE!');
        const first = args[0].ref;
        const rows = this.ctx.rangeRows(first.sheet, first.c1, first.c2, first.r1, first.r2);
        const pairs: Array<{ r: RangeRef; m: (v: Value) => boolean }> = [];
        for (let i = 0; i + 1 < args.length; i += 2) {
          if (args[i].k !== 'range') return E('#VALUE!');
          pairs.push({ r: (args[i] as { k: 'range'; ref: RangeRef }).ref, m: criteriaMatcher(arg(i + 1)) });
        }
        let acc = 0;
        for (const row of rows) {
          for (let c = first.c1; c <= first.c2; c++) {
            if (pairs.every((p) => p.m(this.ctx.getCell(p.r.sheet, p.r.c1 + (c - first.c1), p.r.r1 + (row - first.r1))))) acc++;
          }
        }
        return acc;
      }
      case 'SUMPRODUCT': {
        const lists: number[][] = [];
        for (const a of args) {
          const vals = this.rangeValues(a);
          if (isErr(vals)) return vals;
          lists.push(vals.map((v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0)));
        }
        const n = Math.min(...lists.map((l) => l.length));
        let acc = 0;
        for (let i = 0; i < n; i++) acc += lists.reduce((p, l) => p * l[i], 1);
        return acc;
      }
      case 'ISNUMBER':
        return typeof arg(0) === 'number';
      case 'ISBLANK':
        return arg(0) === null;
      case 'ISERROR':
        return isErr(arg(0));
      case 'N': {
        const v = arg(0);
        return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0;
      }
      default:
        return E('#NAME?');
    }
  }
}

export function rangeToA1(r: RangeRef): string {
  const a = `${numToCol(r.c1)}${Number.isFinite(r.r1) ? r.r1 : ''}`;
  const b = `${numToCol(r.c2)}${Number.isFinite(r.r2) ? r.r2 : ''}`;
  return `${r.sheet ? `'${r.sheet}'!` : ''}${a}:${b}`;
}
