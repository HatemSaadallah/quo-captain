/** PDF export of the web ELENCO COSTI (landscape A4) with pdfkit. */
import PDFDocument from 'pdfkit';
import type { ElencoCosti, Quotation } from '../../common/interfaces/quotation.interface';

const eur = (v: number | null): string => (v === null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (v: number | null, d = 0): string => (v === null ? '' : v.toLocaleString('it-IT', { maximumFractionDigits: d }));

export function elencoCostiPdf(quotation: Quotation, ec: ElencoCosti): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true, info: { Title: `${quotation.reference} ELENCO COSTI`, Author: 'Somec quotation generator' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    // Header block: brand bar, title, then metadata as label/value pairs.
    doc.save().rect(0, 0, doc.page.width, 6).fill('#00939b').restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#00939b').text('SOMEC', left, 18, { characterSpacing: 2 });
    doc.fontSize(15).fillColor('#17303a').text(`Cost breakdown · Offer ${quotation.reference}`, left, 30);
    const meta: Array<[string, string]> = [['Client', quotation.customer], ['Quotation', quotation.name], ['Date', quotation.date], ['Estimator', quotation.estimator], ['Template', quotation.templateWorkbook]];
    const metaY = doc.y + 6;
    const metaW = width / meta.length;
    meta.forEach(([k, v], i) => {
      doc.font('Helvetica').fontSize(6.5).fillColor('#6b7f85').text(k, left + i * metaW, metaY, { width: metaW - 8, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#17303a').text(v || '—', left + i * metaW, metaY + 9, { width: metaW - 8, height: 10, ellipsis: true, lineBreak: false });
    });
    doc.font('Helvetica').fontSize(6.5).fillColor('#6b7f85').text('Estimated costs from historical analyses; not selling prices.', left, metaY + 26, { width });
    doc.fillColor('#000');
    doc.y = metaY + 38;

    const cols: Array<{ key: string; label: string; w: number; align?: 'left' | 'right' }> = [
      { key: 'position', label: 'Pos.', w: 28 },
      { key: 'itemCode', label: 'Item', w: 42 },
      { key: 'description', label: 'Description', w: 250 },
      { key: 'unit', label: 'M.U.', w: 28 },
      { key: 'quantity', label: 'Q.ty', w: 42, align: 'right' },
      { key: 'L', label: 'L (mm)', w: 40, align: 'right' },
      { key: 'H', label: 'H (mm)', w: 40, align: 'right' },
      { key: 'm2Unit', label: 'm² unit', w: 42, align: 'right' },
      { key: 'm2Total', label: 'm² total', w: 48, align: 'right' },
      { key: 'unitCost', label: 'Unit cost €', w: 58, align: 'right' },
      { key: 'totalCost', label: 'Total €', w: 68, align: 'right' },
      { key: 'tab', label: 'Ref. analysis', w: 96 },
    ];
    const rowH = 12;
    const drawHeader = (): void => {
      // One fixed baseline for every label: doc.text() advances doc.y, which made the headers step down diagonally.
      const y = doc.y + 4;
      const bandH = 16;
      doc.save().rect(left, y - 4, width, bandH).fill('#eef3f4').restore();
      doc.fillColor('#17303a').font('Helvetica-Bold').fontSize(7);
      let x = left;
      for (const c of cols) {
        doc.text(c.label, x + 3, y, { width: c.w - 6, align: c.align ?? 'left', lineBreak: false, height: bandH });
        x += c.w;
      }
      doc.moveTo(left, y + bandH - 4).lineTo(left + width, y + bandH - 4).lineWidth(0.6).strokeColor('#9fb3b8').stroke();
      doc.x = left;
      doc.y = y + bandH;
      doc.fillColor('black').strokeColor('black');
    };
    drawHeader();
    doc.font('Helvetica').fontSize(7);
    let striped = false;
    for (const r of ec.rows) {
      const desc = r.description.split(/\r?\n/)[0];
      const lines = Math.max(1, Math.ceil(doc.widthOfString(desc) / (250 - 4)));
      const h = rowH * Math.min(lines, 3);
      if (doc.y + h > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
        drawHeader();
        striped = false;
        doc.font('Helvetica').fontSize(7);
      }
      const y = doc.y;
      if (striped) doc.save().rect(left, y - 1, width, h).fill('#eff4f4').restore();
      striped = !striped;
      doc.fillColor('black');
      const values: Record<string, string> = {
        position: r.position,
        itemCode: r.itemCode,
        description: desc,
        unit: r.unit,
        quantity: num(r.quantity, 3),
        L: num(r.L),
        H: num(r.H),
        m2Unit: num(r.m2Unit, 3),
        m2Total: num(r.m2Total, 2),
        unitCost: r.unitCost === null ? 'missing' : `${eur(r.unitCost)}${r.unitCostSource === 'override' ? ' *' : r.unitCostSource === 'historical' ? ' †' : ''}`,
        totalCost: eur(r.totalCost),
        tab: r.tab ? `${r.tab.offerNo ?? r.tab.workbook} / ${r.tab.sheet}` : '— no analysis',
      };
      let x = left;
      for (const c of cols) {
        doc.text(values[c.key], x + 2, y, { width: c.w - 4, align: c.align ?? 'left', height: h, ellipsis: true });
        x += c.w;
      }
      doc.y = y + h;
    }
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).text(`TOTAL COST  ${eur(ec.totals.totalCost)} €     (m² total ${num(ec.totals.m2Total, 2)})${ec.totals.complete ? '' : `   — ${ec.totals.rowsWithoutCost} row(s) without unit cost`}`, left, doc.y);
    doc.moveDown(0.8);
    const sum = [{ label: 'Position', w: 60 }, { label: 'Rows', w: 40 }, { label: 'm² total', w: 70 }, { label: '€ / m²', w: 70 }, { label: 'Total €', w: 80 }];
    const sumW = sum.reduce((a, c) => a + c.w, 0);
    if (doc.y + 40 + ec.summary.length * 11 > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#17303a').text('Summary by position', left, doc.y);
    let sy = doc.y + 4;
    doc.save().rect(left, sy, sumW, 13).fill('#eef3f4').restore();
    const sumRow = (cells: string[], y: number, bold: boolean): void => {
      let x = left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor('#17303a');
      cells.forEach((v, i) => {
        doc.text(v, x + 3, y + 3, { width: sum[i].w - 6, align: i ? 'right' : 'left', lineBreak: false });
        x += sum[i].w;
      });
    };
    sumRow(sum.map((c) => c.label), sy, true);
    sy += 13;
    for (const s of ec.summary) {
      sumRow([s.position, String(s.rows), num(s.m2Total, 2), s.unitCost === null ? '—' : eur(s.unitCost), eur(s.totalCost)], sy, false);
      sy += 11;
    }
    doc.font('Helvetica').fontSize(6.5).fillColor('#555').text('Unit cost source: no mark = computed from the stored analysis logic · † historical cached value · * manual override.', left, sy + 8, { width });

    // Footer with page numbers on every page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - 20;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(6.5).fillColor('#6b7f85');
      doc.text(`Somec · ${quotation.reference} cost breakdown · generated ${new Date().toISOString().slice(0, 10)}`, left, fy, { lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, left, fy, { width, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
