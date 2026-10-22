/**
 * Build-time theme support (PostCSS plugins, wired in vite.config.ts): a dark colour layer and a
 * presentation text size, both switched at runtime by attributes on <html> (see theme.ts).
 *
 * Dark theme:
 * Every colour declaration is mirrored into a `:root[data-theme="dark"]` copy of its rule, inserted
 * right after the original, so the dark layer keeps the light cascade's order and relative specificity.
 * Colours are remapped by role in OKLCH: white surfaces become dark cards, tints become slightly lighter
 * layers, dark text turns light, light borders darken. Accents, already-dark fills (the sidebar) and
 * translucent overlays keep their colour. Rules that already target `[data-theme]` are hand-written
 * overrides and are left alone.
 */
import type { Declaration, Plugin, Rule } from 'postcss';

export type Rgba = [number, number, number, number];
type Role = 'page' | 'bg' | 'text' | 'border' | 'accent';

const DARK = ':root[data-theme="dark"]';
const KEEP = /\.(sidebar|nav-)/; // the sidebar is dark in both themes: mirrored unchanged
const PAGE = 0.255; // page background: dark grey, not black
const SURFACE = 0.3; // cards sit one step above the page

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** sRGB (0–1) to OKLCH [lightness, chroma, hue in radians]. */
export function toOklch([r, g, b]: Rgba): [number, number, number] {
  const [R, G, B] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(a, bb), Math.atan2(bb, a)];
}

function fromOklch(L: number, C: number, h: number, alpha: number): Rgba {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const [r, g, bl] = rgb.map((c) => clamp(toGamma(clamp(c, 0, 1)), 0, 1)); // ponytail: channel clipping, fine for the low-chroma surfaces we remap
  return [r, g, bl, alpha];
}

/** Dark-mode counterpart of one colour, by the role it plays. */
export function darkColor(role: Role, rgba: Rgba): Rgba {
  const alpha = rgba[3];
  if (alpha < 0.5) return rgba; // translucent tints and overlays sit on whatever is below them
  const [L, C, h] = toOklch(rgba);
  const to = (l: number, c: number): Rgba => fromOklch(l, c, h, alpha);
  switch (role) {
    case 'page':
      return to(PAGE, Math.min(C * 0.5, 0.006));
    case 'bg':
      if (L >= 0.995) return to(SURFACE, C);
      if (L >= 0.75) return to(Math.min(0.5, SURFACE + (0.995 - L) * 1.15), Math.min(C * 1.1, 0.06));
      return rgba; // accents, mid tones and already-dark fills keep their colour
    case 'border':
      if (L >= 0.995) return to(SURFACE, C); // white gaps between chart marks stay surface-coloured
      if (L >= 0.75) return to(Math.min(0.52, SURFACE + 0.07 + (1 - L) * 1.1), Math.min(C, 0.03));
      return rgba;
    case 'text':
      if (L >= 0.7) return rgba; // already light: it sits on a dark or coloured fill
      // Ink turns white (headings ~97% lightness), secondary text a light neutral grey; only real accents keep their hue.
      return C < 0.08 ? to(Math.min(0.985, 1.12 - L * 0.5), Math.min(C, 0.005)) : to(clamp(1.04 - L * 0.6, 0.64, 0.88), Math.min(C, 0.15));
    case 'accent':
      return L < 0.62 ? to(Math.min(0.72, L + 0.12), C) : rgba;
  }
}

const COLOR = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|rgba?\([^)]*\)|\b(?:white|black)\b/gi;
const HAS_COLOR = new RegExp(COLOR.source, 'i'); // stateless twin for .test()

export function parseColor(token: string): Rgba | null {
  const t = token.toLowerCase();
  if (t === 'white') return [1, 1, 1, 1];
  if (t === 'black') return [0, 0, 0, 1];
  if (t.startsWith('#')) {
    const h = t.length <= 5 ? t.slice(1).split('').map((c) => c + c).join('') : t.slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return [r, g, b, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  const parts = t.slice(t.indexOf('(') + 1, -1).split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (p: string): number => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / 255);
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  const out: Rgba = [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
  return out.every(Number.isFinite) ? out : null;
}

export function formatColor([r, g, b, a]: Rgba): string {
  const hex = (v: number): string => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a < 1 ? hex(a) : ''}`;
}

const MANAGED = /^(color|caret-color|accent-color|-webkit-text-fill-color|text-decoration(-color)?|background(-color|-image)?|fill|stroke|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|column-rule(-color)?|box-shadow|scrollbar-color)$/;
const TEXTISH = /text|label|tick|legend|value|title|caption|axis/i; // SVG `fill` on these is text

function roleOf(prop: string, selector: string): Role {
  if (prop.startsWith('--')) {
    if (/^--(bg|page|canvas)$/.test(prop)) return 'page';
    if (prop.endsWith('-ink')) return 'text'; // text on accent fills, e.g. --accent-ink
    if (/line|border|divider|rule|stroke/.test(prop)) return 'border';
    if (/ink|text|muted|fg|label|heading/.test(prop)) return 'text';
    if (/accent|brand|primary|ok|warn|err|danger|success|info/.test(prop)) return 'accent';
    return 'bg';
  }
  if (/^(color|caret-color|accent-color|-webkit-text-fill-color|text-decoration)/.test(prop)) return 'text';
  if (prop === 'fill') return TEXTISH.test(selector) ? 'text' : 'bg';
  if (prop.startsWith('background')) return 'bg';
  return 'border'; // borders, outlines, strokes, shadows
}

const remap = (value: string, role: Role): string => value.replace(COLOR, (token) => {
  const c = parseColor(token);
  return c ? formatColor(darkColor(role, c)) : token;
});

export function darkSelector(selector: string): string {
  return /^(:root|html)\b/.test(selector) ? selector.replace(/^(:root|html)/, DARK) : `${DARK} ${selector}`;
}

const inKeyframes = (rule: Rule): boolean => rule.parent?.type === 'atrule' && /keyframes/i.test((rule.parent as { name?: string }).name ?? '');

export function darkTheme(): Plugin {
  return {
    postcssPlugin: 'somec-dark-theme',
    OnceExit(root) {
      const rules: Rule[] = [];
      root.walkRules((rule) => {
        if (!inKeyframes(rule) && !rule.selector.includes('[data-theme')) rules.push(rule);
      });
      for (const rule of rules) {
        // Mirror every managed declaration, changed or not, so dark rules override each other in the light order.
        const decls = rule.nodes.filter((n): n is Declaration => n.type === 'decl' && (MANAGED.test(n.prop) || (n.prop.startsWith('--') && HAS_COLOR.test(n.value))));
        if (!decls.length) continue;
        // A rule whose own fill keeps its colour (accent chip, dark sidebar) keeps its text and borders too.
        const fills = decls.filter((d) => d.prop === 'background' || d.prop === 'background-color').flatMap((d) => d.value.match(COLOR) ?? []).map(parseColor).filter((c): c is Rgba => c !== null && c[3] >= 0.5);
        const keepInk = fills.length > 0 && fills.every((c) => formatColor(darkColor('bg', c)) === formatColor(c));
        const keepAll = KEEP.test(rule.selector);
        const dark = rule.clone();
        dark.removeAll();
        dark.selectors = rule.selectors.map(darkSelector);
        for (const d of decls) {
          const role = roleOf(d.prop, rule.selector);
          dark.append(d.clone({ value: keepAll || (keepInk && (role === 'text' || role === 'border')) ? d.value : remap(d.value, role) }));
        }
        rule.after(dark);
      }
    },
  };
}

/** Extra px a font size gains in large-text mode: small text grows most (10px → 12px), headings least (28px → 30px). */
export function textBoost(px: number): number {
  const weight = px <= 13 ? 1 : px >= 28 ? 0.4 : 1 - (0.6 * (px - 13)) / 15;
  return Math.round(px * 0.2 * weight * 100) / 100;
}

/** Presentation text size: every px font size grows by textBoost(px) × --text-boost (0 normally, 1 with `<html data-text="large">`). */
export function largeText(): Plugin {
  return {
    postcssPlugin: 'somec-large-text',
    Declaration(decl) {
      if ((decl.prop !== 'font-size' && decl.prop !== 'font') || decl.value.includes('--text-boost')) return;
      decl.value = decl.value.replace(/(^|\s)(\d+(?:\.\d+)?)px\b/, (_m, lead: string, n: string) => `${lead}calc(${n}px + ${textBoost(Number(n))}px * var(--text-boost, 0))`);
    },
  };
}

