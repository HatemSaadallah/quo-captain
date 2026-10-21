/**
 * In-place OOXML (.xlsx) editor working on the zip parts directly, so every
 * feature we do not touch (styles, merged cells, validations, conditional
 * formats, comments, drawings, external links, defined names) survives
 * untouched. Supports: writing values/formulas, clearing cells, copying a
 * worksheet from the same or another workbook (with style remapping), and
 * forcing a full recalculation on next open.
 */
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import type { CellValue } from '../interfaces/xlsx.interface';
import { colToNum, shiftFormula, splitAddr } from './a1';
import { decodeXml, encodeXml, escapeRegExp, xmlAttr } from './xml';

export type CellInput = { v: CellValue } | { f: string };

export interface CopySheetResult {
  name: string;
  partPath: string;
  warnings: string[];
}

const CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const CT_COMMENTS = 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml';
const REL_SHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const REL_COMMENTS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const REL_VML = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing';
const REL_HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

interface StyleParts {
  numFmts: Map<number, string>;
  fonts: string[];
  fills: string[];
  borders: string[];
  cellXfs: string[];
  dxfs: string[];
}

function listOf(xml: string, container: string, item: string): string[] {
  const m = new RegExp(`<${container}(?:\\s[^>]*)?>([\\s\\S]*?)</${container}>`).exec(xml);
  if (!m) return [];
  const re = new RegExp(`<${item}(?:\\s[^>]*)?/>|<${item}(?:\\s[^>]*)?>[\\s\\S]*?</${item}>`, 'g');
  return [...m[1].matchAll(re)].map((x) => x[0]);
}

function parseStyles(xml: string): StyleParts {
  const numFmts = new Map<number, string>();
  for (const nf of listOf(xml, 'numFmts', 'numFmt')) numFmts.set(Number(xmlAttr(nf, 'numFmtId')), xmlAttr(nf, 'formatCode') ?? '');
  return {
    numFmts,
    fonts: listOf(xml, 'fonts', 'font'),
    fills: listOf(xml, 'fills', 'fill'),
    borders: listOf(xml, 'borders', 'border'),
    cellXfs: listOf(xml, 'cellXfs', 'xf'),
    dxfs: listOf(xml, 'dxfs', 'dxf'),
  };
}

function replaceAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  return re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/(\/?>)$/, ` ${name}="${value}"$1`);
}

function setContainerList(xml: string, container: string, items: string[]): string {
  const re = new RegExp(`<${container}(\\s[^>]*)?>[\\s\\S]*?</${container}>|<${container}(\\s[^>]*)?/>`);
  const body = `<${container} count="${items.length}">${items.join('')}</${container}>`;
  if (re.test(xml)) return xml.replace(re, body);
  // container missing (e.g. no dxfs): insert before cellStyles/tableStyles/extLst or at the end
  const anchor = /<(cellStyles|tableStyles|colors|extLst)[\s>]/.exec(xml);
  const at = anchor ? anchor.index : xml.lastIndexOf('</styleSheet>');
  return xml.slice(0, at) + body + xml.slice(at);
}

/** Remove shared-formula grouping in a sheet so individual cells can be rewritten safely. */
export function unshareFormulas(xml: string): string {
  const masters = new Map<string, { col: number; row: number; f: string }>();
  return xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (whole, col: string, row: string, attrs: string, inner?: string) => {
    if (!inner || !/<f[^>]*t="shared"/.test(inner)) return whole;
    const fm = /<f([^>]*)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
    if (!fm) return whole;
    const si = xmlAttr(' ' + fm[1], 'si') ?? '';
    let text: string;
    if (fm[2] !== undefined && fm[2] !== '') {
      text = decodeXml(fm[2]);
      masters.set(si, { col: colToNum(col), row: Number(row), f: text });
    } else {
      const m = masters.get(si);
      if (!m) return whole;
      text = shiftFormula(m.f, Number(row) - m.row, colToNum(col) - m.col);
    }
    const ca = /\sca="1"/.test(fm[1]) ? ' ca="1"' : '';
    const newInner = inner.replace(fm[0], `<f${ca}>${encodeXml(text)}</f>`);
    return `<c r="${col}${row}"${attrs}>${newInner}</c>`;
  });
}

function cellXml(addr: string, style: string | undefined, input: CellInput): string {
  const s = style !== undefined ? ` s="${style}"` : '';
  if ('f' in input) return `<c r="${addr}"${s}><f>${encodeXml(input.f.replace(/^=/, ''))}</f></c>`;
  const v = input.v;
  if (v === null || v === undefined || v === '') return `<c r="${addr}"${s}/>`;
  if (typeof v === 'number') return `<c r="${addr}"${s}><v>${Number.isFinite(v) ? v : 0}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${addr}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  const text = encodeXml(String(v)).replace(/\r/g, '&#xD;');
  return `<c r="${addr}"${s} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

/** Insert or replace one cell in a worksheet XML string, keeping its style. */
export function upsertCell(xml: string, addr: string, input: CellInput): string {
  const { col, row } = splitAddr(addr);
  const cellRe = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const existing = cellRe.exec(xml);
  if (existing) {
    const style = xmlAttr(' ' + existing[1], 's');
    return xml.slice(0, existing.index) + cellXml(addr, style, input) + xml.slice(existing.index + existing[0].length);
  }
  const newCell = cellXml(addr, undefined, input);
  const rowRe = new RegExp(`<row r="${row}"([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
  const rowM = rowRe.exec(xml);
  const myCol = colToNum(col);
  if (rowM) {
    const rowAttrs = rowM[1];
    const inner = rowM[2] ?? '';
    const cells = [...inner.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)];
    let insertAt = inner.length;
    for (const c of cells) {
      if (colToNum(c[1]) > myCol) {
        insertAt = c.index!;
        break;
      }
    }
    const newInner = inner.slice(0, insertAt) + newCell + inner.slice(insertAt);
    const spans = replaceAttr(`<row r="${row}"${rowAttrs}>`, 'spans', `1:${Math.max(myCol, ...cells.map((c) => colToNum(c[1])), 1)}`);
    return xml.slice(0, rowM.index) + spans + newInner + '</row>' + xml.slice(rowM.index + rowM[0].length);
  }
  // row missing: insert in order inside sheetData
  const sd = /<sheetData(?:\s[^>]*)?>([\s\S]*?)<\/sheetData>|<sheetData\s*\/>/.exec(xml);
  if (!sd) throw new Error('sheetData not found');
  const newRow = `<row r="${row}" spans="${myCol}:${myCol}">${newCell}</row>`;
  if (sd[1] === undefined) return xml.replace(sd[0], `<sheetData>${newRow}</sheetData>`);
  const rows = [...sd[1].matchAll(/<row r="(\d+)"/g)];
  let insertAt = sd[1].length;
  for (const r of rows) {
    if (Number(r[1]) > row) {
      insertAt = r.index!;
      break;
    }
  }
  const start = sd.index + sd[0].indexOf('>') + 1;
  const abs = start + insertAt;
  return xml.slice(0, abs) + newRow + xml.slice(abs);
}

/** Remove value and formula of a cell (keeps style). Cells that do not exist are left alone. */
export function clearCell(xml: string, addr: string): string {
  const cellRe = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
  const m = cellRe.exec(xml);
  if (!m) return xml;
  const style = xmlAttr(' ' + m[1], 's');
  return xml.slice(0, m.index) + `<c r="${addr}"${style !== undefined ? ` s="${style}"` : ''}/>` + xml.slice(m.index + m[0].length);
}

/**
 * Clear the contents of cells in rows fromRow..toRow, optionally limited to the
 * columns fromCol..toCol (keeps styles and row attributes). One pass over the sheet.
 */
export function clearRange(xml: string, rows: Set<number> | [number, number], fromCol?: string, toCol?: string): string {
  const inRows = (row: number): boolean => (rows instanceof Set ? rows.has(row) : row >= rows[0] && row <= rows[1]);
  const c1 = fromCol ? colToNum(fromCol) : 1;
  const c2 = toCol ? colToNum(toCol) : Number.MAX_SAFE_INTEGER;
  return xml.replace(/<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (whole, r: string, attrs: string, inner?: string) => {
    if (!inRows(Number(r)) || !inner) return whole;
    const cleared = inner.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (cWhole, col: string, cr: string, cAttrs: string) => {
      const n = colToNum(col);
      if (n < c1 || n > c2) return cWhole;
      const style = xmlAttr(' ' + cAttrs, 's');
      return `<c r="${col}${cr}"${style !== undefined ? ` s="${style}"` : ''}/>`;
    });
    return `<row r="${r}"${attrs}>${cleared}</row>`;
  });
}

/** Clear the contents of every cell in the given rows (keeps styles and row attributes). */
export function clearRows(xml: string, fromRow: number, toRow: number): string {
  return clearRange(xml, [fromRow, toRow]);
}

export class XlsxEditor {
  private readonly parts = new Map<string, string>();
  private sheetMap = new Map<string, string>();
  private readonly log: string[] = [];

  private constructor(
    readonly path: string,
    readonly zip: JSZip,
  ) {}

  static async open(path: string): Promise<XlsxEditor> {
    return XlsxEditor.fromBuffer(await readFile(path), path);
  }

  static async fromBuffer(buf: Buffer | Uint8Array, path = '<buffer>'): Promise<XlsxEditor> {
    const zip = await JSZip.loadAsync(buf);
    const ed = new XlsxEditor(path, zip);
    await ed.refreshSheetMap();
    return ed;
  }

  get changes(): readonly string[] {
    return this.log;
  }

  private async text(part: string): Promise<string> {
    const cached = this.parts.get(part);
    if (cached !== undefined) return cached;
    const f = this.zip.file(part);
    if (!f) throw new Error(`Part not found: ${part}`);
    const s = await f.async('string');
    this.parts.set(part, s);
    return s;
  }

  private set(part: string, content: string): void {
    this.parts.set(part, content);
  }

  private async refreshSheetMap(): Promise<void> {
    const wb = await this.text('xl/workbook.xml');
    const rels = await this.text('xl/_rels/workbook.xml.rels');
    const relMap = new Map<string, string>();
    for (const r of rels.matchAll(/<Relationship\s[^>]*>/g)) relMap.set(xmlAttr(r[0], 'Id') ?? '', xmlAttr(r[0], 'Target') ?? '');
    this.sheetMap = new Map();
    for (const s of wb.matchAll(/<sheet\s[^>]*\/>/g)) {
      const target = relMap.get(xmlAttr(s[0], 'r:id') ?? '');
      if (target) this.sheetMap.set(xmlAttr(s[0], 'name') ?? '', 'xl/' + target.replace(/^\/xl\//, '').replace(/^\//, ''));
    }
  }

  get sheetNames(): string[] {
    return [...this.sheetMap.keys()];
  }

  sheetPart(name: string): string {
    const p = this.sheetMap.get(name);
    if (!p) throw new Error(`Sheet not found: ${name}`);
    return p;
  }

  async sheetXml(name: string): Promise<string> {
    return this.text(this.sheetPart(name));
  }

  /** Expand shared formulas once so later cell writes cannot orphan dependants. */
  async prepareSheet(name: string): Promise<void> {
    const part = this.sheetPart(name);
    const key = `unshared:${part}`;
    if (this.parts.has(key)) return;
    this.set(part, unshareFormulas(await this.text(part)));
    this.parts.set(key, '1');
  }

  async setCell(sheet: string, addr: string, input: CellInput): Promise<void> {
    await this.prepareSheet(sheet);
    const part = this.sheetPart(sheet);
    this.set(part, upsertCell(await this.text(part), addr, input));
    this.log.push(`${sheet}!${addr} = ${'f' in input ? '=' + input.f : JSON.stringify(input.v)}`);
  }

  async setCells(sheet: string, cells: Record<string, CellInput>): Promise<void> {
    for (const [addr, input] of Object.entries(cells)) await this.setCell(sheet, addr, input);
  }

  async clearCells(sheet: string, addrs: string[]): Promise<void> {
    await this.prepareSheet(sheet);
    const part = this.sheetPart(sheet);
    let xml = await this.text(part);
    for (const a of addrs) xml = clearCell(xml, a);
    this.set(part, xml);
    if (addrs.length) this.log.push(`${sheet}: cleared ${addrs.length} cells (${addrs[0]}..${addrs[addrs.length - 1]})`);
  }

  async clearRows(sheet: string, fromRow: number, toRow: number): Promise<void> {
    await this.prepareSheet(sheet);
    const part = this.sheetPart(sheet);
    this.set(part, clearRows(await this.text(part), fromRow, toRow));
    this.log.push(`${sheet}: cleared rows ${fromRow}..${toRow}`);
  }

  async clearRange(sheet: string, rows: Set<number>, fromCol: string, toCol: string): Promise<void> {
    if (!rows.size) return;
    await this.prepareSheet(sheet);
    const part = this.sheetPart(sheet);
    this.set(part, clearRange(await this.text(part), rows, fromCol, toCol));
    this.log.push(`${sheet}: cleared ${fromCol}:${toCol} in ${rows.size} rows`);
  }

  setFullCalcOnLoad(): void {
    void this.text('xl/workbook.xml').then((wb) => {
      let out: string;
      if (/<calcPr\b/.test(wb)) out = wb.replace(/<calcPr\b([^>]*?)\/>/, (m, attrs: string) => `<calcPr${replaceAttr(`<x${attrs}>`, 'fullCalcOnLoad', '1').slice(2, -1)}/>`);
      else out = wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
      this.set('xl/workbook.xml', out);
      this.log.push('workbook: fullCalcOnLoad=1');
    });
  }

  async removeCalcChain(): Promise<void> {
    if (!this.zip.file('xl/calcChain.xml')) return;
    this.zip.remove('xl/calcChain.xml');
    this.parts.delete('xl/calcChain.xml');
    const rels = await this.text('xl/_rels/workbook.xml.rels');
    this.set('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\s[^>]*calcChain\.xml"[^>]*\/>/, ''));
    const ct = await this.text('[Content_Types].xml');
    this.set('[Content_Types].xml', ct.replace(/<Override\s[^>]*calcChain\.xml"[^>]*\/>/, ''));
    this.log.push('workbook: calcChain removed (Excel rebuilds it)');
  }

  private nextPartNumber(prefix: string, ext: string): number {
    let max = 0;
    for (const f of Object.keys(this.zip.files)) {
      const m = new RegExp(`^${escapeRegExp(prefix)}(\\d+)${escapeRegExp(ext)}$`).exec(f);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
  }

  /**
   * Copy worksheet `sourceSheet` of `source` (another workbook, or this one) into this
   * workbook as `newName`, appended as the last sheet. Comments are copied; charts and
   * images are not (reported in warnings). Formulas are kept verbatim, so references to
   * other sheets bind to the sheets of THIS workbook by name.
   */
  async copySheet(source: JSZip, sourceSheet: string, newName: string): Promise<CopySheetResult> {
    if (this.sheetMap.has(newName)) throw new Error(`Sheet '${newName}' already exists`);
    if (!/^[^\\/?*[\]:]{1,31}$/.test(newName)) throw new Error(`Invalid sheet name '${newName}'`);
    const warnings: string[] = [];
    const sameWorkbook = source === this.zip;

    const srcWb = await source.file('xl/workbook.xml')!.async('string');
    const srcRels = await source.file('xl/_rels/workbook.xml.rels')!.async('string');
    const srcRelMap = new Map<string, string>();
    for (const r of srcRels.matchAll(/<Relationship\s[^>]*>/g)) srcRelMap.set(xmlAttr(r[0], 'Id') ?? '', xmlAttr(r[0], 'Target') ?? '');
    let srcPart: string | null = null;
    let srcIndex = -1;
    let i = 0;
    for (const s of srcWb.matchAll(/<sheet\s[^>]*\/>/g)) {
      if (xmlAttr(s[0], 'name') === sourceSheet) {
        const t = srcRelMap.get(xmlAttr(s[0], 'r:id') ?? '') ?? '';
        srcPart = 'xl/' + t.replace(/^\/xl\//, '').replace(/^\//, '');
        srcIndex = i;
      }
      i++;
    }
    if (!srcPart || !source.file(srcPart)) throw new Error(`Source sheet '${sourceSheet}' not found`);
    let xml = await source.file(srcPart)!.async('string');

    // 1. shared strings -> inline strings (keeps rich text runs)
    const ssPart = source.file('xl/sharedStrings.xml');
    if (ssPart) {
      const ss = await ssPart.async('string');
      const items = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1]);
      xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)\st="s"([^>]*?)>([\s\S]*?)<\/c>/g, (whole, addr: string, a1: string, a2: string, inner: string) => {
        const v = /<v>(\d+)<\/v>/.exec(inner);
        if (!v) return whole;
        const si = items[Number(v[1])];
        if (si === undefined) return whole;
        const rest = inner.replace(/<v>\d+<\/v>/, '');
        return `<c r="${addr}"${a1}${a2} t="inlineStr">${rest}<is>${si}</is></c>`;
      });
    }

    // 2. styles
    if (!sameWorkbook) xml = await this.remapStyles(source, xml);

    // 3. sheet-view state that must not be duplicated
    xml = xml.replace(/\stabSelected="1"/g, '');

    // 4. relationships: comments (+ their VML) and hyperlinks are carried over; every other
    //    relationship consumer (drawings, printer settings, tables, controls, OLE, pictures)
    //    is removed from the XML and reported, so the copy never has dangling r:id's.
    const newNo = this.nextPartNumber('xl/worksheets/sheet', '.xml');
    const newPart = `xl/worksheets/sheet${newNo}.xml`;
    const srcRelsPart = srcPart.replace(/worksheets\/(sheet\d+\.xml)$/, 'worksheets/_rels/$1.rels');
    const newRels: string[] = [];
    const keptIds = new Set<string>();
    const srcSheetRels = source.file(srcRelsPart);
    if (srcSheetRels) {
      const rx = await srcSheetRels.async('string');
      for (const r of rx.matchAll(/<Relationship\s[^>]*>/g)) {
        const type = xmlAttr(r[0], 'Type') ?? '';
        const id = xmlAttr(r[0], 'Id') ?? '';
        const target = xmlAttr(r[0], 'Target') ?? '';
        const mode = xmlAttr(r[0], 'TargetMode');
        const abs = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\.\//, '');
        if (type === REL_COMMENTS && source.file(abs)) {
          const n = this.nextPartNumber('xl/comments', '.xml');
          const dest = `xl/comments${n}.xml`;
          this.zip.file(dest, await source.file(abs)!.async('nodebuffer'));
          newRels.push(`<Relationship Id="${id}" Type="${REL_COMMENTS}" Target="../comments${n}.xml"/>`);
          await this.addContentTypeOverride(`/${dest}`, CT_COMMENTS);
          keptIds.add(id);
        } else if (type === REL_VML && source.file(abs)) {
          const n = this.nextPartNumber('xl/drawings/vmlDrawing', '.vml');
          const dest = `xl/drawings/vmlDrawing${n}.vml`;
          this.zip.file(dest, await source.file(abs)!.async('nodebuffer'));
          newRels.push(`<Relationship Id="${id}" Type="${REL_VML}" Target="../drawings/vmlDrawing${n}.vml"/>`);
          await this.ensureDefaultContentType('vml', 'application/vnd.openxmlformats-officedocument.vmlDrawing');
          keptIds.add(id);
        } else if (type === REL_HYPERLINK) {
          newRels.push(`<Relationship Id="${id}" Type="${REL_HYPERLINK}" Target="${encodeXml(target)}"${mode ? ` TargetMode="${mode}"` : ''}/>`);
          keptIds.add(id);
        } else {
          warnings.push(`relationship ${id} (${type.split('/').pop()} -> ${target}) not copied`);
        }
      }
    }
    xml = xml.replace(/<(\w+)\b([^>]*?)\sr:id="(rId\d+)"([^>]*?)(\/>|>[\s\S]*?<\/\1>)/g, (whole: string, tag: string, a1: string, id: string, a2: string, tail: string) => {
      if (keptIds.has(id)) return whole;
      if (tag === 'pageSetup') return `<pageSetup${a1}${a2}${tail}`; // keep page setup, drop printer settings binary
      warnings.push(`<${tag}> referencing ${id} removed (${tag === 'drawing' ? 'charts/images' : tag} are not copied)`);
      return '';
    });
    xml = xml.replace(/<(tableParts|controls|oleObjects|hyperlinks)\b[^>]*>\s*<\/\1>/g, '');
    const dangling = [...xml.matchAll(/\sr:id="(rId\d+)"/g)].map((m) => m[1]).filter((id) => !keptIds.has(id));
    if (dangling.length) throw new Error(`Sheet copy would leave dangling relationship ids: ${dangling.join(', ')}`);
    this.assertStylesResolve(xml, await this.text('xl/styles.xml'));

    // 5. register the sheet
    this.zip.file(newPart, xml);
    this.parts.delete(newPart);
    if (newRels.length) {
      this.zip.file(
        `xl/worksheets/_rels/sheet${newNo}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${newRels.join('')}</Relationships>`,
      );
    }
    await this.addContentTypeOverride(`/${newPart}`, CT_SHEET);
    const rels = await this.text('xl/_rels/workbook.xml.rels');
    const rid = `rId${this.nextRelId(rels)}`;
    this.set('xl/_rels/workbook.xml.rels', rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL_SHEET}" Target="worksheets/sheet${newNo}.xml"/></Relationships>`));
    let wb = await this.text('xl/workbook.xml');
    let maxId = 0;
    for (const s of wb.matchAll(/<sheet\s[^>]*\/>/g)) maxId = Math.max(maxId, Number(xmlAttr(s[0], 'sheetId') ?? 0));
    const newIndex = [...wb.matchAll(/<sheet\s[^>]*\/>/g)].length;
    wb = wb.replace('</sheets>', `<sheet name="${encodeXml(newName)}" sheetId="${maxId + 1}" r:id="${rid}"/></sheets>`);
    // sheet-scoped defined names (print area, autofilter) of the source sheet
    if (srcIndex >= 0) {
      const names: string[] = [];
      for (const d of srcWb.matchAll(/<definedName\s([^>]*)>([^<]*)<\/definedName>/g)) {
        if (xmlAttr(' ' + d[1], 'localSheetId') !== String(srcIndex)) continue;
        const name = xmlAttr(' ' + d[1], 'name') ?? '';
        const ref = decodeXml(d[2]).replace(new RegExp(`'${escapeRegExp(sourceSheet.replace(/'/g, "''"))}'!`, 'g'), `'${newName.replace(/'/g, "''")}'!`);
        if (/#REF!/.test(ref)) continue;
        names.push(`<definedName name="${encodeXml(name)}" localSheetId="${newIndex}"${/\shidden="1"/.test(d[1]) ? ' hidden="1"' : ''}>${encodeXml(ref)}</definedName>`);
      }
      if (names.length) {
        wb = /<definedNames>/.test(wb) ? wb.replace('</definedNames>', names.join('') + '</definedNames>') : wb.replace('</sheets>', `</sheets><definedNames>${names.join('')}</definedNames>`);
      }
    }
    this.set('xl/workbook.xml', wb);
    await this.refreshSheetMap();
    this.log.push(`sheet '${newName}' copied from '${sourceSheet}' (${newPart})${warnings.length ? ' with warnings' : ''}`);
    return { name: newName, partPath: newPart, warnings };
  }

  /** Every s="n" / dxfId="n" in a sheet must point inside this workbook's style tables. */
  private assertStylesResolve(sheetXml: string, stylesXml: string): void {
    const xfCount = listOf(stylesXml, 'cellXfs', 'xf').length;
    const dxfCount = listOf(stylesXml, 'dxfs', 'dxf').length;
    let maxS = -1;
    for (const m of sheetXml.matchAll(/<(?:c|row)\s[^>]*?\ss="(\d+)"/g)) maxS = Math.max(maxS, Number(m[1]));
    for (const m of sheetXml.matchAll(/<col\s[^>]*?\sstyle="(\d+)"/g)) maxS = Math.max(maxS, Number(m[1]));
    let maxDxf = -1;
    for (const m of sheetXml.matchAll(/\sdxfId="(\d+)"/g)) maxDxf = Math.max(maxDxf, Number(m[1]));
    if (maxS >= xfCount) throw new Error(`Sheet copy references cell style ${maxS} but the workbook has ${xfCount} styles`);
    if (maxDxf >= dxfCount) throw new Error(`Sheet copy references differential style ${maxDxf} but the workbook has ${dxfCount}`);
  }

  private nextRelId(rels: string): number {
    let max = 0;
    for (const m of rels.matchAll(/Id="rId(\d+)"/g)) max = Math.max(max, Number(m[1]));
    return max + 1;
  }

  private async addContentTypeOverride(partName: string, contentType: string): Promise<void> {
    const ct = await this.text('[Content_Types].xml');
    if (ct.includes(`PartName="${partName}"`)) return;
    this.set('[Content_Types].xml', ct.replace('</Types>', `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`));
  }

  private async ensureDefaultContentType(ext: string, contentType: string): Promise<void> {
    const ct = await this.text('[Content_Types].xml');
    if (new RegExp(`<Default Extension="${ext}"`).test(ct)) return;
    this.set('[Content_Types].xml', ct.replace('<Override', `<Default Extension="${ext}" ContentType="${contentType}"/><Override`));
  }

  /** Append the styles a foreign sheet uses to this workbook's styles.xml and rewrite its s="n" / dxfId="n" indices. */
  private async remapStyles(source: JSZip, sheetXml: string): Promise<string> {
    const srcStyles = parseStyles(await source.file('xl/styles.xml')!.async('string'));
    let dstXml = await this.text('xl/styles.xml');
    const dst = parseStyles(dstXml);
    const addUnique = (list: string[], item: string): number => {
      const i = list.indexOf(item);
      if (i >= 0) return i;
      list.push(item);
      return list.length - 1;
    };
    let nextNumFmt = Math.max(163, ...dst.numFmts.keys()) + 1;
    const numFmtMap = new Map<number, number>();
    const mapNumFmt = (id: number): number => {
      if (id < 164) return id;
      const cached = numFmtMap.get(id);
      if (cached !== undefined) return cached;
      const code = srcStyles.numFmts.get(id) ?? '';
      let found: number | undefined;
      for (const [k, v] of dst.numFmts) if (v === code) found = k;
      if (found === undefined) {
        found = nextNumFmt++;
        dst.numFmts.set(found, code);
      }
      numFmtMap.set(id, found);
      return found;
    };
    const xfMap = new Map<number, number>();
    const mapXf = (n: number): number => {
      const cached = xfMap.get(n);
      if (cached !== undefined) return cached;
      const xf = srcStyles.cellXfs[n];
      if (!xf) {
        xfMap.set(n, 0);
        return 0;
      }
      let t = xf;
      t = replaceAttr(t.includes('</xf>') ? t.replace(/>[\s\S]*$/, '>') : t, 'fontId', String(addUnique(dst.fonts, srcStyles.fonts[Number(xmlAttr(xf, 'fontId') ?? 0)] ?? dst.fonts[0]))) + (t.includes('</xf>') ? t.slice(t.indexOf('>') + 1) : '');
      const head = t.includes('</xf>') ? t.slice(0, t.indexOf('>') + 1) : t;
      const tail = t.includes('</xf>') ? t.slice(t.indexOf('>') + 1) : '';
      let h = head;
      h = replaceAttr(h, 'fillId', String(addUnique(dst.fills, srcStyles.fills[Number(xmlAttr(xf, 'fillId') ?? 0)] ?? dst.fills[0])));
      h = replaceAttr(h, 'borderId', String(addUnique(dst.borders, srcStyles.borders[Number(xmlAttr(xf, 'borderId') ?? 0)] ?? dst.borders[0])));
      h = replaceAttr(h, 'numFmtId', String(mapNumFmt(Number(xmlAttr(xf, 'numFmtId') ?? 0))));
      h = replaceAttr(h, 'xfId', '0');
      const idx = addUnique(dst.cellXfs, h + tail);
      xfMap.set(n, idx);
      return idx;
    };
    const dxfMap = new Map<number, number>();
    const mapDxf = (n: number): number => {
      const cached = dxfMap.get(n);
      if (cached !== undefined) return cached;
      const idx = addUnique(dst.dxfs, srcStyles.dxfs[n] ?? '<dxf/>');
      dxfMap.set(n, idx);
      return idx;
    };
    let out = sheetXml.replace(/<c r="[A-Z]+\d+"[^>]*?\ss="(\d+)"/g, (m, s: string) => m.replace(/\ss="\d+"/, ` s="${mapXf(Number(s))}"`));
    out = out.replace(/<row\s[^>]*?\ss="(\d+)"/g, (m, s: string) => m.replace(/\ss="\d+"/, ` s="${mapXf(Number(s))}"`));
    out = out.replace(/<col\s[^>]*?\sstyle="(\d+)"/g, (m, s: string) => m.replace(/\sstyle="\d+"/, ` style="${mapXf(Number(s))}"`));
    out = out.replace(/\sdxfId="(\d+)"/g, (_m, s: string) => ` dxfId="${mapDxf(Number(s))}"`);
    // write back merged style lists
    dstXml = setContainerList(dstXml, 'fonts', dst.fonts);
    dstXml = setContainerList(dstXml, 'fills', dst.fills);
    dstXml = setContainerList(dstXml, 'borders', dst.borders);
    dstXml = setContainerList(dstXml, 'cellXfs', dst.cellXfs);
    if (dst.dxfs.length) dstXml = setContainerList(dstXml, 'dxfs', dst.dxfs);
    const nf = [...dst.numFmts].map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${encodeXml(code)}"/>`);
    if (nf.length) {
      if (/<numFmts\b/.test(dstXml)) dstXml = setContainerList(dstXml, 'numFmts', nf);
      else dstXml = dstXml.replace(/<fonts\b/, `<numFmts count="${nf.length}">${nf.join('')}</numFmts><fonts`);
    }
    this.set('xl/styles.xml', dstXml);
    return out;
  }

  async save(outPath: string): Promise<void> {
    for (const [part, content] of this.parts) {
      if (part.startsWith('unshared:')) continue;
      this.zip.file(part, content);
    }
    const buf = await this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await writeFile(outPath, buf);
  }
}
