// Calendar arithmetic in local time. Dates travel as ISO strings (YYYY-MM-DD)
// and times of day as minutes since midnight, so nothing depends on a time zone.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
