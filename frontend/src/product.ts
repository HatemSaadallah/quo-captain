import type { CatalogRecord, SearchHit } from './api';

/** Product view of a historical analysis: typology, materials and a photo, all derived from the workbook text. */
export interface Typology {
  key: string;
  label: string;
  test: RegExp;
}

// Order matters: the first match wins (piping before balcony, because "PIPING FOR BALCONY AREAS").
const ALL_TYPOLOGIES: Typology[] = [
  { key: 'piping', label: 'Piping & Drainage', test: /piping|\bpipe|scupper|drain|washing outlet|plumbing/i },
  { key: 'windscreen', label: 'Windscreen', test: /wind ?screen|windbreak/i },
  { key: 'door', label: 'Sliding Door', test: /^(?!.*(platform|plates for|screens? in front)).*\bdoors?\b/i }, // a platform *for* doors is not a door
  { key: 'divider', label: 'Balcony Divider', test: /divider|partition|\blfd\b/i },
  { key: 'handrail', label: 'Handrail', test: /handrail/i },
  { key: 'balustrade', label: 'Balustrade', test: /balustrade|railing|stanchion/i },
  { key: 'hatch', label: 'Service Hatch', test: /hatch/i },
  { key: 'ceiling', label: 'Ceiling', test: /ceiling/i },
  { key: 'canopy', label: 'Canopy & Catwalk', test: /canop|catwalk|shelter|awning/i },
  { key: 'deck', label: 'Flooring', test: /floor|deck cover|decking|teak|raised/i },
  { key: 'balcony', label: 'Pre-fab Balcony', test: /balcon|platform|pre-?fab/i },
  { key: 'jacuzzi', label: 'Jacuzzi & Pool', test: /jacuzzi|whirlpool|swimming pool|waterslide|\bpool\b|\bspa\b/i },
  { key: 'electrical', label: 'Electrical & Lighting', test: /loudspeaker|\bled\b|light|electric|cabl/i },
  { key: 'cleaning', label: 'Protection & Cleaning', test: /clean|protection|washing|hand ?over/i },
];
/** Somec's product range in these workbooks: glass envelope and flooring. Other workbook rows (piping, electrical, cleaning, pool works…) are services, not catalog products. */
const PRODUCT_KEYS = new Set(['windscreen', 'balustrade', 'handrail', 'divider', 'door', 'balcony', 'deck']);
export const TYPOLOGIES: Typology[] = ALL_TYPOLOGIES.filter((t) => PRODUCT_KEYS.has(t.key));
// Workbook rows that are not sellable products: deltas (extras, options, deductions, variations), works and services, tests, mock-ups and lines struck out as not necessary.
const NOT_A_PRODUCT = /deduct|\bextra\b|^\s*option|\(option\)|optional|addition of|only install|installation (works|of)|design|access equipment|shower|ice bar|light|electric|outlet|systems passing|positioning|temporary|weather cover|mock[ -]?up|fixing points|sealing|blast|not nec|spare parts|\btests?\b|paint|mural|reinforcement|enhancement|change of|update of|foundation|containment|\bvar\.?\s?\d/i;
export const isProduct = (r: CatalogRecord): boolean => PRODUCT_KEYS.has(typologyOf(r).key) && !NOT_A_PRODUCT.test(r.title ?? '') && (r.unitCost ?? 1) > 0;
const OUTFITTING: Typology = { key: 'outfitting', label: 'Outfitting Works', test: /$^/ };

// Photos per typology (Wikimedia Commons, in public/products, credited in CREDITS.md). Typologies without their own
// photo borrow close ones: the jacuzzi glass guard is a windscreen, sliding doors open onto cabin balconies.
const IMAGES: Record<string, string[]> = {
  windscreen: ['windscreen-1', 'jacuzzi-1', 'balustrade-1'],
  door: ['balcony-3', 'balcony-1', 'balcony-2'],
  divider: ['divider-1', 'divider-2'],
  handrail: ['handrail-1', 'handrail-2'],
  balustrade: ['balustrade-1', 'balustrade-2'],
  balcony: ['balcony-1', 'balcony-2', 'balcony-3'],
  deck: ['deck-3', 'deck-1', 'deck-2'],
  jacuzzi: ['jacuzzi-1', 'jacuzzi-2'],
  piping: ['piping-1'],
  hatch: ['hatch-1'],
  canopy: ['canopy-1'],
  cleaning: ['cleaning-1'],
  ceiling: ['deck-3'],
};
const SHIPYARD = ['shipyard-1', 'shipyard-2']; // electrical, outfitting and anything unclassified
const photos = (key: string): string[] => IMAGES[key] ?? SHIPYARD;

export const MATERIALS: Array<{ label: string; test: RegExp }> = [
  { label: 'Glass', test: /glass|\bpanes?\b|\bdgu\b|tempered|laminated/i },
  { label: 'Stainless steel', test: /stainless|aisi ?316|aisi ?304/i },
  { label: 'Aluminium', test: /alumin/i },
  { label: 'Steel', test: /(?<!stainless )\bsteel\b|galvani/i },
  { label: 'Teak / wood', test: /teak|\bwood|timber/i },
  { label: 'Synthetic', test: /synthetic|resin|\bpvc\b|rubber|polyurethane|\bepoxy/i },
  { label: 'Composite', test: /honeycomb|composite|sandwich/i },
  { label: 'Insulation', test: /insulat|rock ?wool|mineral wool/i },
];

const hash = (s: string): number => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function typologyOf(r: Pick<CatalogRecord, "title" | "categoryName" | "description">): Typology {
  for (const text of [r.title, r.categoryName, (r.description ?? '').slice(0, 400)]) {
    if (!text) continue;
    const t = ALL_TYPOLOGIES.find((ty) => ty.test.test(text));
    if (t) return t;
  }
  return OUTFITTING;
}

export function materialsOf(r: CatalogRecord): string[] {
  const text = `${r.title ?? ''}\n${r.description ?? ''}`;
  return MATERIALS.filter((m) => m.test.test(text)).map((m) => m.label);
}

/** Products with their own picture (uploaded or chosen); loaded at sign-in. */
let customImages: Record<string, string> = {};
export const setCustomImages = (m: Record<string, string>): void => {
  customImages = m;
};

/** Library photos that fit a description, best typology first: offered when a new product has no image. */
export function suggestImages(text: string): string[] {
  const own = photos(typologyOf({ title: text, categoryName: null, description: text }).key);
  const others = Object.entries(IMAGES).filter(([k]) => k !== 'cleaning' && k !== 'piping').map(([, list]) => list[0]);
  return [...new Set([...own, ...others])].slice(0, 8).map((name) => `/products/${name}.jpg`);
}

export function imageOf(r: Pick<CatalogRecord, "id" | "title" | "categoryName" | "description">): string {
  if (customImages[r.id]) return customImages[r.id];
  const list = photos(typologyOf(r).key);
  return `/products/${list[hash(r.id) % list.length]}.jpg`;
}

// Sentence case for the workbooks' ALL-CAPS titles, keeping trade acronyms (ADA, LFD, FZ…), type codes (P1, T2, S717), H= heights and kN loads readable.
const ACRONYMS = /\b(ada|lfd|fz|fwd|mvz|dk|rina|led|pvc|dgu|hpl|aom|avxl|ws)\b/g;
export function cleanTitle(r: CatalogRecord): string {
  const t = (r.title ?? r.description?.split('\n')[0] ?? 'Untitled item').replace(/^\s*POS\.?\s*[\d.]+\s*[-–]?\s*/i, '').trim();
  const sentence = t.charAt(0) + t.slice(1).toLowerCase();
  return sentence.replace(ACRONYMS, (m) => m.toUpperCase()).replace(/\b(?!m\d)[a-z]\d+\b/g, (m) => m.toUpperCase()).replace(/\bm2\b/g, 'm²').replace(/\bh ?=/g, (m) => m.toUpperCase()).replace(/\bkn\//g, 'kN/').replace(/\bd\.l\b\.?/g, 'D.L.');
}

export function locationOf(r: CatalogRecord): string | null {
  const m = /\b(?:dk|deck)\.?\s*([\d÷,&\s-]+)/i.exec(r.description ?? '');
  return m ? `Deck ${m[1].trim().replace(/[,&\s-]+$/, '')}` : null;
}

export function dims(r: CatalogRecord): string | null {
  if (r.L && r.H) return `${Math.round(r.L)} × ${Math.round(r.H)} mm`;
  if (r.L) return `L ${Math.round(r.L)} mm`;
  if (r.H) return `H ${Math.round(r.H)} mm`;
  return null;
}

export interface SimilarProduct {
  hit: SearchHit;
  score: number;
  sameTypology: boolean;
  sharedMaterials: string[];
}

/** Rank similar products by text/embedding similarity, same typology and shared materials. */
export function rankSimilar(target: CatalogRecord, hits: SearchHit[]): SimilarProduct[] {
  const ty = typologyOf(target).key;
  const mats = materialsOf(target);
  const seen = new Set([`${cleanTitle(target)}|${target.unitCost}`]);
  return hits
    .filter((h) => {
      if (!isProduct(h.record)) return false;
      const k = `${cleanTitle(h.record)}|${h.record.unitCost}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((hit) => {
      const m = materialsOf(hit.record);
      const shared = m.filter((x) => mats.includes(x));
      const union = new Set([...m, ...mats]).size || 1;
      const sameTypology = typologyOf(hit.record).key === ty;
      return { hit, sameTypology, sharedMaterials: shared, score: 0.55 * hit.score + 0.3 * (sameTypology ? 1 : 0) + 0.15 * (shared.length / union) };
    })
    .sort((a, b) => b.score - a.score);
}

export const sourceOf = (r: CatalogRecord): string => r.offerNo ?? r.workbook.replace(/\s*Analisi\.xlsx$/i, '');

/** Labour (site installation, site management, travel) and transport are quoted as separate lines. */
export const LABOUR_CATEGORY = /INSTALLAZIONE DI CANTIERE|GESTIONE DI CANTIERE|VIAGGI E TRASFERTE/i;
export const TRANSPORT_CATEGORY = /TRASPORT/i;
export function separateShare(r: Pick<CatalogRecord, 'costBreakdown'>): { labour: number; transport: number; keep: number } {
  const all = r.costBreakdown.reduce((a, b) => a + (b.unitCost ?? 0), 0);
  const part = (re: RegExp): number => (all > 0 ? r.costBreakdown.filter((b) => re.test(b.category)).reduce((a, b) => a + (b.unitCost ?? 0), 0) / all : 0);
  const labour = part(LABOUR_CATEGORY);
  const transport = part(TRANSPORT_CATEGORY);
  return { labour, transport, keep: 1 - labour - transport };
}
/** Product cost without labour and transport. */
export const productCost = (r: CatalogRecord): number | null => (r.unitCost === null ? null : r.unitCost * separateShare(r).keep);

// Somec's cost categories (Italian, from the analysis sheets) in English; the original stays available as a tooltip.
const COST_CATEGORIES: Record<string, string> = {
  'INSTALLAZIONE DI CANTIERE': 'Site installation',
  'DISEGNI DI PROGETTAZIONE': 'Design drawings',
  'IMPREVISTI & RETTIFICHE COSTI': 'Contingencies & cost adjustments',
  ACCESSORI: 'Accessories',
  'VITI, BULLONI, INCASSATI, CAST IN CHANNEL': 'Screws, bolts, inserts & cast-in channels',
  TRASPORTI: 'Transport',
  'ASSICURAZIONI & BONDS': 'Insurance & bonds',
  'MATERIALE DA IMBALLO': 'Packaging',
  'MATERIALE DI CONSUMO': 'Consumables',
  'TRATTAMENTO E VERNICIATURA SUPERFICI': 'Surface treatment & painting',
  'GESTIONE DI CANTIERE E SICUREZZA': 'Site management & safety',
  "ATTIVITA' DI GESTIONE COMMESSA": 'Project management',
  'CALCOLO STRUTTURALE': 'Structural calculations',
  'VIAGGI E TRASFERTE': 'Travel & expenses',
  'SILICONE, SIGILLANTE ADESIVO': 'Silicone & adhesive sealant',
  'PRODUZIONE ASSEMBLAGGIO INTERNO': 'In-house assembly',
  'MOCK-UP TESTS & CERTIFICAZIONI': 'Mock-ups, tests & certification',
  'MOCK-UP, TESTS & CERTIFICAZIONI': 'Mock-ups, tests & certification',
  'CONSUMI DI CANTIERE (ACQUA, EE, GASOLIO ECC)': 'Site utilities (water, power, fuel)',
  'ENTI DI REGISTRO': 'Classification society',
  'ENTI DI REGISTRO (APPROVAZIONE DISEGNI)': 'Classification society (drawing approval)',
  GUARNIZIONI: 'Gaskets',
  'ALLUMINIO - PROFILI': 'Aluminium profiles',
  'ALLUMINIO - LAMIERE': 'Aluminium sheets',
  'ALLUMINIO - STRUTTURE': 'Aluminium structures',
  'ALLUMINIO - MATRICI E STAMPI': 'Aluminium dies & moulds',
  'ALLUMINIO - STRUTTURE E FUSIONI DI ALLUMINIO, GRATE, GRIGLIE E FRANGISOLE': 'Aluminium structures, castings, grilles & louvres',
  'LAVORAZIONI MECCANICHE': 'Machining',
  'EQUIPAGGIAMENTI DI CANTIERE': 'Site equipment',
  'MATERIALI PER PROTEZIONI': 'Protection materials',
  "MATERIALI PER PROTEZIONI (MATERIALI D'IMBALLAGGIO)": 'Protection materials (packaging)',
  'UFFICI DI CANTIERE': 'Site offices',
  'CASSONE E RIMOZIONE RIFIUTI': 'Skips & waste removal',
  'ACCIAIO INOSSIDABILE - STRUTTURE': 'Stainless steel structures',
  'ACCIAIO INOSSIDABILE - LAMIERE': 'Stainless steel sheets',
  'ACCIAIO INOSSIDABILE - PROFILI': 'Stainless steel profiles',
  'ACCIAIO INOSSIDABILE - ALTRO': 'Stainless steel, other',
  'ACCIAIO - STRUTTURE': 'Steel structures',
  'ACCIAIO - LAMIERE': 'Steel sheets',
  SUBAPPALTI: 'Subcontracting',
  'VETRO - VETRO': 'Glass',
  'VETRO - VETRO SPECIALE': 'Special glass',
  'STOCCAGGIO FUORI CANTIERE': 'Off-site storage',
  'PRODUZIONE ESTERNA': 'External production',
  'ALTRI MATERIALI GREZZI': 'Other raw materials',
  'PULIZIE IN CANTIERE': 'Site cleaning',
  AUTOMAZIONI: 'Automation',
  'AUTOMAZIONI (MOTORI, DISPOSITIVI E MATERIALI ELETTRICI)': 'Automation (motors, devices, electrical)',
  'PRODOTTI FINITI': 'Finished products',
  'PRODOTTI FINITI (PORTE E FINESTRE, TENDE, PRODOTTI STD E CORRIMANO TEAK)': 'Finished products (doors, windows, blinds, teak handrails)',
  'MARMO, PIETRA, TERRACOTTA': 'Marble, stone & terracotta',
  'ISOLAMENTO E PROTEZIONI AL FUOCO': 'Insulation & fire protection',
  'ISOLAMENTO, PROTEZIONE AL FUOCO, MEMBRANE': 'Insulation, fire protection & membranes',
  'ALTRI TRATT. SUPERFICIALI (FLOORING, MARMO, PIETRA E TERRACOTTA)': 'Other surface finishes (flooring, marble, stone)',
};
export const costCategory = (name: string): string => COST_CATEGORIES[name.trim().replace(/\s+/g, ' ').toUpperCase()] ?? name;
