/**
 * Minimal, read-only OOXML (.xlsx) reader.
 *
 * Reads formulas AND cached values straight from the zip parts so we never
 * confuse a cached calculation result with an editable input: a cell with `f`
 * is a formula output; a cell without `f` is a literal input.
 *
 * Shared formulas (`<f t="shared" si="n"/>`) are expanded to their effective
 * per-cell text so callers always see the real formula.
 */
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import type { Cell, DefinedName, ExternalLink, SheetData, SheetEntry } from '../interfaces/xlsx.interface';
import { colToNum, shiftFormula } from './a1';
import { decodeXml, xmlAttr } from './xml';

export const EXCEL_ERROR = /^#(N\/A|VALUE!|REF!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)$/;

interface SharedMaster {
  col: number;
  row: number;
  f: string;
}

export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    out.push(decodeXml([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  }
  return out;
}

export function parseSheetXml(name: string, path: string, xml: string, sharedStrings: string[]): SheetData {
  const cells = new Map<string, Cell>();
  const shared = new Map<string, SharedMaster>();
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = m[1];
    const row = Number(m[2]);
    const attrs = ' ' + m[3];
    const inner = m[4] ?? '';
    const t = xmlAttr(attrs, 't');
    const sIdx = xmlAttr(attrs, 's');
    const cell: Cell = { v: null };
    if (sIdx !== undefined) cell.s = Number(sIdx);

    const fm = /<f([^>]*)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
    if (fm) {
      const fAttrs = ' ' + fm[1];
      const text = fm[2] !== undefined ? decodeXml(fm[2]) : '';
      const si = xmlAttr(fAttrs, 'si');
      if (xmlAttr(fAttrs, 't') === 'shared' && si !== undefined) {
        if (text) {
          shared.set(si, { col: colToNum(col), row, f: text });
          cell.f = text;
        } else {
          const master = shared.get(si);
          cell.f = master ? shiftFormula(master.f, row - master.row, colToNum(col) - master.col) : '';
        }
      } else {
        cell.f = text;
      }
    }

    const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
    const raw: string | null = vm ? vm[1] : null;
    if (t === 's' && raw !== null) cell.v = sharedStrings[Number(raw)] ?? null;
    else if (t === 'inlineStr') {
      const is = /<is>([\s\S]*?)<\/is>/.exec(inner);
      cell.v = is ? decodeXml([...is[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')) : null;
    } else if (t === 'str') cell.v = raw !== null ? decodeXml(raw) : null;
    else if (t === 'e') {
      cell.v = raw !== null ? decodeXml(raw) : null;
      cell.err = true;
    } else if (t === 'b') cell.v = raw === '1';
    else if (raw !== null) {
      const trimmed = raw.trim();
      cell.v = trimmed === '' ? null : Number(trimmed);
    }
    // Excel also caches error results of string formulas as t="str" text.
    if (typeof cell.v === 'string' && EXCEL_ERROR.test(cell.v)) cell.err = true;
    cells.set(col + row, cell);
  }
  const dim = /<dimension ref="([^"]*)"/.exec(xml);
  return { name, path, cells, dimension: dim ? dim[1] : null, xml };
}

export class XlsxWorkbook {
  private readonly sheetCache = new Map<string, SheetData>();

  private constructor(
    readonly path: string,
    readonly zip: JSZip,
    readonly sheetNames: string[],
    readonly sheetPaths: Map<string, string>,
    readonly sheetEntries: Map<string, SheetEntry>,
    readonly sharedStrings: string[],
    readonly definedNames: DefinedName[],
    readonly externalLinks: ExternalLink[],
    readonly calcPr: Record<string, string>,
  ) {}

  static async open(path: string): Promise<XlsxWorkbook> {
    return XlsxWorkbook.fromBuffer(await readFile(path), path);
  }

  static async fromBuffer(buf: Buffer | Uint8Array, path = '<buffer>'): Promise<XlsxWorkbook> {
    const zip = await JSZip.loadAsync(buf);
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const rels = new Map<string, string>();
    for (const r of relsXml.matchAll(/<Relationship\s[^>]*>/g)) {
      const id = xmlAttr(r[0], 'Id');
      const target = xmlAttr(r[0], 'Target');
      if (id && target) rels.set(id, target.startsWith('/xl/') ? target.slice(4) : target);
    }
    const sheetNames: string[] = [];
    const sheetPaths = new Map<string, string>();
    const sheetEntries = new Map<string, SheetEntry>();
    for (const s of wbXml.matchAll(/<sheet\s[^>]*\/>/g)) {
      const name = xmlAttr(s[0], 'name') ?? '';
      const rId = xmlAttr(s[0], 'r:id') ?? xmlAttr(s[0], 'id') ?? '';
      const target = rels.get(rId);
      if (!target) continue;
      sheetNames.push(name);
      sheetPaths.set(name, 'xl/' + target.replace(/^\//, ''));
      sheetEntries.set(name, { sheetId: xmlAttr(s[0], 'sheetId') ?? '', rId, state: xmlAttr(s[0], 'state') });
    }
    const ssFile = zip.file('xl/sharedStrings.xml');
    const sharedStrings = ssFile ? parseSharedStrings(await ssFile.async('string')) : [];
    const definedNames: DefinedName[] = [];
    for (const d of wbXml.matchAll(/<definedName\s([^>]*)>([^<]*)<\/definedName>/g)) {
      const local = xmlAttr(' ' + d[1], 'localSheetId');
      definedNames.push({
        name: xmlAttr(' ' + d[1], 'name') ?? '',
        ref: decodeXml(d[2]),
        ...(local !== undefined ? { localSheetId: Number(local) } : {}),
      });
    }
    const externalLinks: ExternalLink[] = [];
    for (const f of Object.keys(zip.files)) {
      const m = /^xl\/externalLinks\/_rels\/(externalLink\d+\.xml)\.rels$/.exec(f);
      if (!m) continue;
      const x = await zip.file(f)!.async('string');
      for (const r of x.matchAll(/<Relationship\s[^>]*>/g)) {
        externalLinks.push({ part: m[1], target: xmlAttr(r[0], 'Target') ?? '' });
      }
    }
    const calcPr: Record<string, string> = {};
    const cp = /<calcPr\s([^>]*)\/>/.exec(wbXml);
    if (cp) for (const a of cp[1].matchAll(/(\w+)="([^"]*)"/g)) calcPr[a[1]] = a[2];
    return new XlsxWorkbook(path, zip, sheetNames, sheetPaths, sheetEntries, sharedStrings, definedNames, externalLinks, calcPr);
  }

  hasSheet(name: string): boolean {
    return this.sheetPaths.has(name);
  }

  async sheet(name: string): Promise<SheetData> {
    const cached = this.sheetCache.get(name);
    if (cached) return cached;
    const path = this.sheetPaths.get(name);
    if (!path) throw new Error(`Sheet not found: ${name}`);
    const xml = await this.zip.file(path)!.async('string');
    const data = parseSheetXml(name, path, xml, this.sharedStrings);
    this.sheetCache.set(name, data);
    return data;
  }

  async cell(sheet: string, addr: string): Promise<Cell | undefined> {
    return (await this.sheet(sheet)).cells.get(addr);
  }

  /** Release a parsed sheet from the cache (big workbooks). */
  release(name: string): void {
    this.sheetCache.delete(name);
  }
}
