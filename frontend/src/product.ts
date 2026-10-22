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
  { key: 'door', label: 'Sliding Door', test: /\bdoors?\b/i },
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
const NOT_A_PRODUCT = /deduct|extra (cost|price|for)|^\s*option|addition of|only install|installation (works|of)|design|access equipment|shower|ice bar|light|electric|outlet|systems passing|positioning|temporary|weather cover|mock ?up|fixing points|sealing|blast/i;
export const isProduct = (r: CatalogRecord): boolean => PRODUCT_KEYS.has(typologyOf(r).key) && !NOT_A_PRODUCT.test(r.title ?? '');
const OUTFITTING: Typology = { key: 'outfitting', label: 'Outfitting Works', test: /$^/ };

// Images: Wikimedia Commons, downloaded into public/products. Typologies without a dedicated photo reuse a close one.
const IMAGE_SET: Record<string, string> = { ceiling: 'deck', electrical: 'shipyard', outfitting: 'shipyard' };
const IMAGE_COUNT: Record<string, number> = { jacuzzi: 3, piping: 1, windscreen: 3, door: 2, divider: 2, handrail: 2, balustrade: 2, hatch: 1, canopy: 1, deck: 3, balcony: 3, cleaning: 1, shipyard: 3 };

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
  const t = typologyOf({ title: text, categoryName: null, description: text }).key;
  const set = IMAGE_SET[t] ?? t;
  const own = Array.from({ length: IMAGE_COUNT[set] ?? 1 }, (_, i) => `/products/${set}-${i + 1}.jpg`);
  const others = Object.entries(IMAGE_COUNT).filter(([k]) => k !== set && k !== 'cleaning' && k !== 'piping').map(([k]) => `/products/${k}-1.jpg`);
  return [...own, ...others].slice(0, 8);
}

export function imageOf(r: Pick<CatalogRecord, "id" | "title" | "categoryName" | "description">): string {
  if (customImages[r.id]) return customImages[r.id];
  const t = typologyOf(r).key;
  const set = IMAGE_SET[t] ?? t;
  return `/products/${set}-${(hash(r.id) % (IMAGE_COUNT[set] ?? 1)) + 1}.jpg`;
}

export function cleanTitle(r: CatalogRecord): string {
  const t = (r.title ?? r.description?.split('\n')[0] ?? 'Untitled item').replace(/^\s*POS\.?\s*[\d.]+\s*[-–]?\s*/i, '').trim();
  return t.charAt(0) + t.slice(1).toLowerCase();
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
