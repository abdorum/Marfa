// Absence, read as the student needs it: a traffic light, and how many classes
// are left before the limit (Docs/21: Purdue Course Signals, すごい時間割).
import type { Snapshot } from '../model';
import { currentTerm } from './schedule';
import { daysBetween, fromIsoDate } from './time';

export type Level = 'ok' | 'warn' | 'risk';

/** Half the limit is a warning; 80% of it is a risk. */
export function attendanceLevel(pct: number, limit: number): Level {
  const ratio = limit > 0 ? pct / limit : 0;
  return ratio >= 0.8 ? 'risk' : ratio >= 0.5 ? 'warn' : 'ok';
}

export interface AbsenceBudget {
  /** Class meetings a week, over all of the course's components. */
  perWeek: number;
  weeks: number;
  total: number;
  /** Classes that may be missed in the whole term at the limit. */
  allowed: number;
  used: number;
  /** Classes left before the limit, on the cautious count. */
  left: number;
  /** The term's dates are known; otherwise the count is the cautious one. */
  endKnown: boolean;
  /** When the term's end is unknown: what is left if the term runs its usual length. */
  leftAtMost?: number;
}

/**
 * Weeks of a term without classes as a rule (holidays, exam weeks). Without
 * the term's dates, the count leaves them out: a budget that is too small
 * warns early, one that is too large lets the student miss one class too many.
 */
const QUIET_WEEKS = 3;

/**
 * An estimate, never the record: the term's classes are counted from the
 * weekly schedule, and the source's percentage is applied to them. The term
 * length comes from its dates, or, cautiously, from the institution's usual length.
 */
export function absenceBudget(s: Snapshot, courseKey: string, pct: number, limit: number, usualWeeks: number): AbsenceBudget | undefined {
  const term = currentTerm(s);
  const perWeek = s.sections
    .filter(x => x.courseKey === courseKey && (!term || x.termCode === term.code))
    .reduce((n, x) => n + x.meetings.reduce((k, m) => k + m.days.length, 0), 0);
  if (!perWeek) return undefined;
  const endKnown = !!(term?.start && term.end);
  const count = (weeks: number) => {
    const total = perWeek * weeks;
    const allowed = Math.floor((total * limit) / 100);
    const used = Math.round((total * pct) / 100);
    return { weeks, total, allowed, used, left: Math.max(0, allowed - used) };
  };
  if (endKnown) {
    const weeks = Math.max(1, Math.ceil((daysBetween(fromIsoDate(term!.start!), fromIsoDate(term!.end!)) + 1) / 7));
    return { perWeek, ...count(weeks), endKnown };
  }
  const cautious = count(Math.max(1, usualWeeks - QUIET_WEEKS));
  const usual = count(usualWeeks);
  return { perWeek, ...cautious, endKnown, leftAtMost: usual.left > cautious.left ? usual.left : undefined };
}
