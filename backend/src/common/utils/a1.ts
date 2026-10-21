/** A1-style cell addressing helpers and relative-reference shifting. */

export interface CellAddress {
  col: string;
  row: number;
}

export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function splitAddr(addr: string): CellAddress {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(addr);
  if (!m) throw new Error(`Bad cell address: ${addr}`);
  return { col: m[1], row: Number(m[2]) };
}

/** Columns between two column letters, inclusive. */
export function colRange(first: string, last: string): string[] {
  const out: string[] = [];
  for (let c = colToNum(first); c <= colToNum(last); c++) out.push(numToCol(c));
  return out;
}

/** Quote a sheet name for use in a formula: 10 -> '10', MDO -> MDO. */
export function sheetRef(sheet: string, addr: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(sheet) ? `${sheet}!${addr}` : `'${sheet.replace(/'/g, "''")}'!${addr}`;
}

/**
 * Shift relative A1 references in a formula by (dRow, dCol). Absolute parts ($)
 * are untouched. String literals and quoted sheet names are skipped.
 * Column-only ranges (A:H) are left as-is (only used with dCol = 0 here).
 */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  let out = '';
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < formula.length) {
        if (formula[j] === '"') {
          if (formula[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += formula.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      while (j < formula.length && formula[j] !== "'") j++;
      out += formula.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/.exec(formula.slice(i));
    const prev = i > 0 ? formula[i - 1] : '';
    if (m && (!/[\w.!]/.test(prev) || prev === '!')) {
      const [, cAbs, col, rAbs, row] = m;
      const newCol = cAbs ? col : numToCol(colToNum(col) + dCol);
      const newRow = rAbs ? Number(row) : Number(row) + dRow;
      out += `${cAbs}${newCol}${rAbs}${newRow}`;
      i += m[0].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
