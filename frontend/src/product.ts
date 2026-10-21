import type { CatalogRecord, SearchHit } from './api';

/** Product view of a historical analysis: typology, materials and a photo, all derived from the workbook text. */
export interface Typology {
  key: string;
  label: string;
  test: RegExp;
}

// Order matters: the first match wins (piping before balcony, because "PIPING FOR BALCONY AREAS").
export const TYPOLOGIES: Typology[] = [
  { key: 'jacuzzi', label: 'Jacuzzi & Pool', test: /jacuzzi|whirlpool|swimming pool|waterslide|\bpool\b|\bspa\b/i },
  { key: 'piping', label: 'Piping & Drainage', test: /piping|\bpipe|scupper|drain|washing outlet|plumbing/i },
  { key: 'windscreen', label: 'Windscreen', test: /wind ?screen|windbreak/i },
  { key: 'door', label: 'Sliding Door', test: /\bdoors?\b/i },
  { key: 'divider', label: 'Balcony Divider', test: /divider|partition|\blfd\b/i },
  { key: 'handrail', label: 'Handrail', test: /handrail/i },
  { key: 'balustrade', label: 'Balustrade', test: /balustrade|railing|stanchion/i },
  { key: 'hatch', label: 'Service Hatch', test: /hatch/i },
  { key: 'ceiling', label: 'Ceiling', test: /ceiling/i },
  { key: 'canopy', label: 'Canopy & Catwalk', test: /canop|catwalk|shelter|awning/i },
  { key: 'deck', label: 'Deck Covering', test: /floor|deck cover|decking|teak|raised/i },
  { key: 'balcony', label: 'Pre-fab Balcony', test: /balcon|platform|pre-?fab/i },
  { key: 'electrical', label: 'Electrical & Lighting', test: /loudspeaker|\bled\b|light|electric|cabl/i },
  { key: 'cleaning', label: 'Protection & Cleaning', test: /clean|protection|washing|hand ?over/i },
];
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

export function typologyOf(r: CatalogRecord): Typology {
  for (const text of [r.title, r.categoryName, (r.description ?? '').slice(0, 400)]) {
    if (!text) continue;
    const t = TYPOLOGIES.find((ty) => ty.test.test(text));
    if (t) return t;
  }
  return OUTFITTING;
}

export function materialsOf(r: CatalogRecord): string[] {
  const text = `${r.title ?? ''}\n${r.description ?? ''}`;
  return MATERIALS.filter((m) => m.test.test(text)).map((m) => m.label);
}

export function imageOf(r: CatalogRecord): string {
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
