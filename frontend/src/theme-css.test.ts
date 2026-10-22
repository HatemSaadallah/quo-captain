import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { darkColor, darkTheme, largeText, parseColor, textBoost, toOklch } from './theme-css';

const run = (css: string): string => postcss([darkTheme()]).process(css, { from: undefined }).css;
const lightness = (hex: string): number => toOklch(parseColor(hex)!)[0];
const darkRule = (css: string, selector: string): string => new RegExp(`:root\\[data-theme="dark"\\] ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(run(css))?.[1] ?? '';

describe('dark theme', () => {
  it('turns white cards dark, keeps them above the page, and turns dark text light', () => {
    const card = darkRule('.card { background: #fff; color: #16202c; border: 1px solid #d9dfe7; }', '.card');
    const bg = /background: (#[0-9a-f]+)/.exec(card)![1];
    const ink = /color: (#[0-9a-f]+)/.exec(card)![1];
    expect(lightness(bg)).toBeLessThan(0.25);
    expect(lightness(ink)).toBeGreaterThan(0.8);
    expect(card).toMatch(/border: 1px solid #[0-9a-f]{6}/);
    const page = /\[data-theme="dark"\] \{ --bg: (#[0-9a-f]+)/.exec(run(':root { --bg: #f3f5f8; --line: #d9dfe7; }'))![1];
    expect(lightness(page)).toBeLessThan(lightness(bg));
  });

  it('keeps accents, the dark sidebar, translucent overlays and text on coloured chips', () => {
    expect(darkColor('bg', parseColor('#00939b')!)).toEqual(parseColor('#00939b'));
    expect(darkColor('bg', parseColor('#152e38')!)).toEqual(parseColor('#152e38'));
    expect(darkColor('bg', parseColor('#ffffff10')!)).toEqual(parseColor('#ffffff10'));
    expect(darkColor('text', parseColor('#eaf0f1')!)).toEqual(parseColor('#eaf0f1'));
    expect(darkRule('.chip { background: #6cadab; color: #13343a; }', '.chip')).toContain('color: #13343a');
    expect(darkRule('.sidebar-signout::after { background: #ffffff; }', '.sidebar-signout::after')).toContain('background: #ffffff');
  });

  it('mirrors each rule right after it, so later light rules still win in dark mode', () => {
    const out = run('.btn { background: #fff; } .btn.primary { background: transparent; } @keyframes pulse { 0% { background: #fff; } }');
    const order = ['.btn {', ':root[data-theme="dark"] .btn {', '.btn.primary {', ':root[data-theme="dark"] .btn.primary {'].map((s) => out.indexOf(s));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]))).toBe(true);
    expect(out).toContain(':root[data-theme="dark"] .btn.primary { background: transparent; }');
    expect(out).not.toContain(':root[data-theme="dark"] 0%');
  });

  it('leaves hand-written dark overrides alone', () => {
    expect(run(':root[data-theme="dark"] .logo { color: #000; }')).toBe(':root[data-theme="dark"] .logo { color: #000; }');
  });
});

describe('large text', () => {
  const run = (css: string): string => postcss([largeText()]).process(css, { from: undefined }).css;
  it('boosts px font sizes behind a variable, small text most', () => {
    expect(run('.a { font-size: 10px; }')).toBe('.a { font-size: calc(10px + 2px * var(--text-boost, 0)); }');
    expect(run('.code { font: 11px ui-monospace, monospace; }')).toBe('.code { font: calc(11px + 2.2px * var(--text-boost, 0)) ui-monospace, monospace; }');
    expect(textBoost(28) / 28).toBeLessThan(textBoost(12) / 12);
    expect(run('.b { font-size: 1.2em; padding: 4px; }')).toBe('.b { font-size: 1.2em; padding: 4px; }');
  });
});

