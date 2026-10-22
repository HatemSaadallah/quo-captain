/** PDF export of the web ELENCO COSTI (landscape A4) with pdfkit. */
import PDFDocument from 'pdfkit';
import type { ElencoCosti, Quotation } from '../../common/interfaces/quotation.interface';

const eur = (v: number | null): string => (v === null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (v: number | null, d = 0): string => (v === null ? '' : v.toLocaleString('it-IT', { maximumFractionDigits: d }));

export function elencoCostiPdf(quotation: Quotation, ec: ElencoCosti): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, info: { Title: `${quotation.reference} ELENCO COSTI`, Author: 'Somec quotation generator' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    doc.fontSize(14).font('Helvetica-Bold').text(`ELENCO COSTI — Offer n° ${quotation.reference}`, left, doc.y);
    doc.fontSize(9).font('Helvetica').text(`Client: ${quotation.customer}   Quotation: ${quotation.name}   Date: ${quotation.date}   Estimator: ${quotation.estimator}   Template: ${quotation.templateWorkbook}`);
    doc.moveDown(0.3).fontSize(7).fillColor('#555').text('Estimated costs computed from historical analyses (reference tabs); not selling prices. J = unit cost of the attached analysis (computed / historical / manual override); H = m² unit; I = m² total; K = J × Q.ty.', { width });
    doc.fillColor('#000').moveDown(0.6);

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
    for (const r of ec.rows) {
      const desc = r.description.split(/\r?\n/)[0];
      const lines = Math.max(1, Math.ceil(doc.widthOfString(desc) / (250 - 4)));
      const h = rowH * Math.min(lines, 3);
      if (doc.y + h > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(7);
      }
      const y = doc.y;
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
        unitCost: r.unitCost === null ? 'missing' : `${eur(r.unitCost)} (${r.unitCostSource[0]})`,
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
    doc.fontSize(8).text('Summary by position');
    doc.font('Helvetica').fontSize(7);
    for (const s of ec.summary) doc.text(`${s.position.padEnd(4)}  rows ${s.rows}   m² ${num(s.m2Total, 2).padStart(10)}   unit €/m² ${s.unitCost === null ? '—' : eur(s.unitCost)}   total € ${eur(s.totalCost)}`);
    doc.moveDown(0.8).fontSize(6).fillColor('#555').text(`Generated ${new Date().toISOString()} · (c) computed by the app engine from the stored sheet logic, (h) historical cached value, (o) manual override.`);
    doc.end();
  });
}
