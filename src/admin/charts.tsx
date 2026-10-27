// The owner's page's charts: columns over days or hours, and rows of shares.
// Thin marks with a rounded data end, a 2px gap between stacked parts, one
// baseline; the readout above a chart names the column under the pointer (or
// chosen with the arrow keys), and every chart has its numbers as a table.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

const SLOT = 20;
const BAR = 14;
const HEIGHT = 120;
const GAP = 2;

/** A column part with a rounded top (4px), square at the baseline. */
function top(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** A clean ceiling for the axis: 5, 10, 20, 50, 100… */
function ceiling(max: number) {
  if (max <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map(m => m * p).find(v => v >= max)!;
}

export interface Column {
  /** Bottom to top; each part's value and its color variable. */
  parts: { value: number; color: string }[];
  /** Under the axis, when given. */
  tick?: string;
}

/**
 * Columns along one baseline. `readout(i)` describes column i above the chart;
 * `initial` is the one described before the pointer moves.
 */
export function Columns({ columns, readout, initial = columns.length - 1, label, table }: {
  columns: Column[];
  readout: (i: number) => ComponentChildren;
  initial?: number;
  label: string;
  table: ComponentChildren;
}) {
  const [sel, setSel] = useState(initial);
  const max = ceiling(Math.max(1, ...columns.map(c => c.parts.reduce((n, p) => n + p.value, 0))));
  const width = columns.length * SLOT;
  const y = (v: number) => (v / max) * HEIGHT;
  return (
    <figure class="chart">
      <figcaption class="readout" aria-live="polite">{readout(sel)}</figcaption>
      <div class="plot">
        <span class="axis-max mono">{max}</span>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT + 1}`} preserveAspectRatio="none" role="img" aria-label={label} tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setSel(i => Math.max(0, Math.min(columns.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1))));
            }
          }}
          onPointerLeave={() => setSel(initial)}
        >
          <line class="grid" x1="0" x2={width} y1="0.5" y2="0.5" />
          <line class="grid" x1="0" x2={width} y1={HEIGHT / 2} y2={HEIGHT / 2} />
          {columns.map((c, i) => {
            const x = i * SLOT + (SLOT - BAR) / 2;
            let base = HEIGHT;
            const shown = c.parts.filter(p => p.value > 0);
            return (
              <g class={i === sel ? 'on' : ''}>
                {i === sel && <rect class="sel" x={i * SLOT} y="0" width={SLOT} height={HEIGHT} />}
                {shown.map((p, k) => {
                  const h = Math.max(1.5, y(p.value) - (k ? GAP : 0));
                  base -= h + (k ? GAP : 0);
                  return k === shown.length - 1
                    ? <path d={top(x, base, BAR, h)} style={{ fill: `var(${p.color})` }} />
                    : <rect x={x} y={base} width={BAR} height={h} style={{ fill: `var(${p.color})` }} />;
                })}
                <rect class="hit" x={i * SLOT} y="0" width={SLOT} height={HEIGHT} onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)} />
              </g>
            );
          })}
          <line class="base" x1="0" x2={width} y1={HEIGHT + 0.5} y2={HEIGHT + 0.5} />
        </svg>
        <div class="ticks mono" aria-hidden="true">
          {columns.map(c => <span>{c.tick ?? ''}</span>)}
        </div>
      </div>
      <details class="numbers">
        <summary>الأرقام</summary>
        {table}
      </details>
    </figure>
  );
}

/** Rows of a whole: a label, its share as a bar, and its number. */
export function Shares({ rows, total }: { rows: { label: ComponentChildren; n: number; color?: string; note?: string }[]; total: number }) {
  return (
    <ul class="shares">
      {rows.map(r => (
        <li>
          <span class="t">{r.label}{r.note && <small>{r.note}</small>}</span>
          <b class="mono"><bdi>{r.n}</bdi></b>
          <i style={{ '--w': `${total ? Math.max(2, (r.n / total) * 100) : 0}%`, '--c': `var(${r.color ?? '--chart-1'})` }} />
        </li>
      ))}
    </ul>
  );
}
