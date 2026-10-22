import JSZip from 'jszip';

/** Minimal .xlsx writer for value exports (no formulas): one sheet per entry, bold header cells, column widths. */
export interface WriterCell {
  addr: string;
  v: number | string | boolean | null;
  bold?: boolean;
  /** Shown with two decimals and thousands separator. */
  money?: boolean;
}
export interface WriterSheet {
  name: string;
  cells: WriterCell[];
  widths?: Record<string, number>;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colNum = (c: string): number => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
/** Excel sheet names: max 31 chars, no []:*?/\ and unique. */
const sheetName = (raw: string, used: Set<string>): string => {
  let base = raw.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name.toLowerCase());
  return name;
};

export async function writeXlsx(sheets: WriterSheet[]): Promise<Buffer> {
  const zip = new JSZip();
  const used = new Set<string>();
  const names = sheets.map((s) => sheetName(s.name, used));
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  // styles: 0 default, 1 bold, 2 money, 3 bold money
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`);
  sheets.forEach((s, i) => {
    const rows = new Map<number, WriterCell[]>();
    for (const c of s.cells) {
      const m = /^([A-Z]+)(\d+)$/.exec(c.addr);
      if (!m || c.v === null || c.v === '') continue;
      const r = Number(m[2]);
      rows.set(r, [...(rows.get(r) ?? []), c]);
    }
    const body = [...rows.keys()].sort((a, b) => a - b).map((r) => {
      // Excel requires cells in column order within a row
      const cells = rows.get(r)!.sort((a, b) => colNum(a.addr.replace(/\d+/g, '')) - colNum(b.addr.replace(/\d+/g, '')));
      return `<row r="${r}">${cells.map((c) => {
        const style = c.bold ? (c.money ? 3 : 1) : c.money ? 2 : 0;
        const sAttr = style ? ` s="${style}"` : '';
        if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${c.addr}"${sAttr}><v>${c.v}</v></c>`;
        if (typeof c.v === 'boolean') return `<c r="${c.addr}"${sAttr} t="b"><v>${c.v ? 1 : 0}</v></c>`;
        return `<c r="${c.addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');
    const cols = Object.entries(s.widths ?? {}).sort((a, b) => colNum(a[0]) - colNum(b[0])).map(([c, w]) => `<col min="${colNum(c)}" max="${colNum(c)}" width="${Math.min(Math.max(w, 6), 80)}" customWidth="1"/>`).join('');
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}/></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
