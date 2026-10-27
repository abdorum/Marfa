// Every pair of text and ground the app uses is checked against WCAG AA in
// both themes, from the tokens themselves (src/web/styles/tokens.css), so a
// colour changed by hand cannot quietly drop below the line.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/web/styles/tokens.css', import.meta.url), 'utf8');

/** The custom properties of the first block that opens with `head`. */
function block(head: string): Record<string, string> {
  const start = css.indexOf(head);
  if (start < 0) throw new Error(`no block ${head}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1]!, m[2]!.trim()]));
}

type RGBA = [number, number, number, number];

function parse(value: string, vars: Record<string, string>): RGBA {
  const v = value.trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return parse(vars[ref[1]!] ?? '', vars);
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as RGBA;
  const rgb = v.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)%\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4]) / 100];
  const mix = v.match(/^color-mix\(in srgb, (.+?) ([\d.]+)%, (.+)\)$/);
  if (mix) {
    const a = parse(mix[1]!, vars);
    const b = parse(mix[3]!, vars);
    const p = Number(mix[2]) / 100;
    return [0, 1, 2].map(i => a[i]! * p + b[i]! * (1 - p)).concat(1) as RGBA;
  }
  throw new Error(`cannot read colour ${v}`);
}

const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map(i => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])).concat(1) as RGBA;
const luminance = (c: RGBA) => {
  const [r, g, b] = c.slice(0, 3).map(x => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
function ratio(fgName: string, bgName: string, vars: Record<string, string>): number {
  const bg = parse(`var(--${bgName})`, vars);
  const fg = over(parse(`var(--${fgName})`, vars), bg);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Text on its ground: 4.5:1. */
const TEXT: [string, string][] = [
  ['ink', 'surface'], ['ink-2', 'surface'], ['ink-3', 'surface'], ['ink', 'surface-2'], ['ink-2', 'surface-2'],
  ['on-bar', 'bar'], ['on-bar-2', 'bar'], ['on-bg', 'bg-solid'], ['on-bg-2', 'bg-solid'],
  ['accent', 'surface'], ['dock-ink', 'surface'], ['on-highlight', 'highlight'],
  ['ok-ink', 'surface'], ['warn-ink', 'surface'], ['risk-ink', 'surface'],
  ['ok-ink', 'ok-soft'], ['warn-ink', 'warn-soft'], ['risk-ink', 'risk-soft'],
];
/** A mark that carries meaning (a meter, a state light, an empty square's edge) on its ground: 3:1. */
const GRAPHIC: [string, string][] = [['ok', 'surface'], ['warn', 'surface'], ['risk', 'surface'], ['ink-3', 'surface'], ['ink-2', 'surface-3']];

const light = block(':root {');
const dark = { ...light, ...block(':root[data-theme="dark"] {') };

describe.each([['day', light], ['night', dark]] as const)('contrast, %s', (_, vars) => {
  it.each(TEXT)('text %s on %s reaches 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg, vars)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(GRAPHIC)('mark %s on %s reaches 3:1', (fg, bg) => {
    expect(ratio(fg, bg, vars)).toBeGreaterThanOrEqual(3);
  });
});

it('the night theme is the same whether chosen or followed from the system', () => {
  const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  expect(block(':root:not([data-theme="light"]) {')).toEqual(block(':root[data-theme="dark"] {'));
  expect(media).toContain(':root:not([data-theme="light"])');
});
