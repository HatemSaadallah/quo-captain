import type { PrismaClient } from '@prisma/client';

const SERIES = [
  ['WPU102501', 'Aluminum mill shapes', 'Index 1982=100'],
  ['WPU1311', 'Flat glass', 'Index 1982=100'],
  ['WPU101', 'Iron and steel', 'Index 1982=100'],
  ['WPU1041', 'Hardware, not elsewhere classified', 'Index 1982=100'],
  ['WPU071', 'Rubber and rubber products', 'Index 1982=100'],
  ['WPU066', 'Plastic resins and materials', 'Index 1982=100'],
  ['WPU081', 'Lumber', 'Index 1982=100'],
  ['WPU1392', 'Insulation materials', 'Index 1982=100'],
  ['WPU067904', 'Adhesives and sealants', 'Index Dec 1983=100'],
  ['WPU13', 'Nonmetallic mineral products', 'Index 1982=100'],
] as const;

export async function seedMarket(prisma: PrismaClient): Promise<void> {
  for (const [id, title, units] of SERIES) {
    const metadata = { title, units, sourceUrl: `https://data.bls.gov/timeseries/${id}` };
    await prisma.marketSeries.upsert({ where: { id }, update: metadata, create: { id, ...metadata } });
  }
  const mappings: Array<[string[], string, string]> = [
    [['ALUPRO', 'ALULAM', 'ALUSTR'], 'WPU102501', 'US aluminum mill-shape trend; excludes alloy, fabrication and European supplier premiums.'],
    [['VETRO', 'VETROS'], 'WPU1311', 'US flat-glass trend; excludes tempering, lamination and specialty-glazing premiums.'],
    [['ACCSTR', 'ACCLAM', 'ACXSTR', 'ACXLAM', 'ACXPRO'], 'WPU101', 'Broad US iron-and-steel proxy; not a stainless grade or fabrication quote.'],
    [['VITI', 'ACCSS'], 'WPU1041', 'Broad US hardware proxy; not a quote for a particular fixing or accessory.'],
    [['G'], 'WPU071', 'US rubber-products proxy; not a specific gasket quote.'],
    [['RESIN', 'PVC', 'COMPOSITE'], 'WPU066', 'Broad US plastic-resin proxy; excludes panel manufacture, composite mix and epoxy specification.'],
    [['TEAK'], 'WPU081', 'Broad US lumber proxy; not a teak-specific market price.'],
    [['ISOL'], 'WPU1392', 'US insulation-materials proxy; not a fire-rating-specific quote.'],
    [['SIG'], 'WPU067904', 'US adhesive-and-sealant trend; not a specific silicone product quote.'],
    [['PIETRA'], 'WPU13', 'Broad US nonmetallic-mineral proxy; not a stone-specification quote.'],
  ];
  for (const [ids, marketSeriesId, marketNote] of mappings) {
    await prisma.rawMaterial.updateMany({ where: { id: { in: ids } }, data: { marketSeriesId, marketNote } });
  }
}
