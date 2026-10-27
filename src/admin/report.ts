// The statistics Raad sends (raad/server/stats.ts: StatsReport), shaped for the
// owner's page: one row per day with no day missing, and totals over a span.
import type { Kind, StatsReport } from '../../raad/server/stats';

export interface DayRow { day: string; students: number; new: number; opens: number; syncs: number }

/** Codes of a sync that reached the college; the rest were refused before it. */
export const REACHED = ['OK', 'PARTIAL', 'BAD_CREDENTIALS', 'ACCOUNT', 'SESSION_EXPIRED', 'NOT_AUTHORIZED', 'TIMEOUT', 'UPSTREAM', 'BLOCKED', 'SERVER_ERROR', 'OTHER'];
export const SUCCEEDED = ['OK', 'PARTIAL'];

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Every day from `from` to `today`, oldest first. */
export function days(r: StatsReport): DayRow[] {
  const out: DayRow[] = [];
  for (let d = r.from; d <= r.today; d = addDays(d, 1)) out.push({ day: d, students: 0, new: 0, opens: 0, syncs: 0 });
  const at = new Map(out.map(x => [x.day, x]));
  for (const x of r.days) Object.assign(at.get(x.day) ?? {}, { students: x.students, new: x.new });
  for (const c of r.counts) {
    const row = at.get(c.day);
    if (!row) continue;
    if (c.kind === 'open') row.opens += c.n;
    if (c.kind === 'outcome' && REACHED.includes(c.what)) row.syncs += c.n;
  }
  return out;
}

/** The counts of one kind over the last `span` days, by key. */
export function totals(r: StatsReport, kind: Kind, span: number): Map<string, { n: number; ms: number }> {
  const from = addDays(r.today, 1 - span);
  const out = new Map<string, { n: number; ms: number }>();
  for (const c of r.counts) {
    if (c.kind !== kind || c.day < from) continue;
    const t = out.get(c.what) ?? { n: 0, ms: 0 };
    t.n += c.n;
    t.ms += c.ms;
    out.set(c.what, t);
  }
  return out;
}

/** Syncs over the last `span` days: how many reached the college, how many succeeded, how long they took. */
export function syncs(r: StatsReport, span: number) {
  const t = totals(r, 'outcome', span);
  const sum = (codes: string[]) => codes.reduce((n, c) => n + (t.get(c)?.n ?? 0), 0);
  const reached = sum(REACHED);
  const ok = sum(SUCCEEDED);
  const ms = SUCCEEDED.reduce((n, c) => n + (t.get(c)?.ms ?? 0), 0);
  const failed = [...t].filter(([c]) => REACHED.includes(c) && !SUCCEEDED.includes(c)).sort((a, b) => b[1].n - a[1].n);
  const refused = [...t].filter(([c]) => !REACHED.includes(c)).sort((a, b) => b[1].n - a[1].n);
  return { reached, ok, rate: reached ? ok / reached : undefined, avgMs: ok ? ms / ok : undefined, failed, refused };
}

/** Syncs by hour of the day (the institution's time), over the last `span` days. */
export function hours(r: StatsReport, span: number): number[] {
  const t = totals(r, 'hour', span);
  return Array.from({ length: 24 }, (_, h) => t.get(String(h).padStart(2, '0'))?.n ?? 0);
}
