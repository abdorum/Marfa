// The student's record in «مساحتي»: a few numbers drawn from the snapshot, as a
// game's character screen draws its attributes, and the badges earned. Only
// what the data says: no total of hours to graduate, no cumulative average
// unless the college's page gives one.
import type { Snapshot, TermStats } from '../model';
import { currentTerm } from './schedule';

export type BadgeId = 'firstGrade' | 'gpa35' | 'cleanCourse' | 'farFromLimit' | 'termDone' | 'units30';
export const BADGES: readonly BadgeId[] = ['firstGrade', 'farFromLimit', 'cleanCourse', 'gpa35', 'termDone', 'units30'];

export interface RecordView {
  /** 0–100: what is left after the average absence of this term's courses. */
  attendance?: number;
  /** The current term's average, or the latest term that has one. */
  gpa?: number;
  /** The term before it. */
  previousGpa?: number;
  /** As the college's page states it, when it does. */
  cumulativeGpa?: number;
  unitsPassed: number;
  unitsInProgress: number;
  /** The course whose absence is highest this term. */
  worst?: { courseKey: string; absencePct: number };
  earned: ReadonlySet<BadgeId>;
}

/** All terms' statistics, the archive's first, each term once (the live copy wins). */
function allStats(s: Snapshot): TermStats[] {
  const byTerm = new Map<string, TermStats>();
  for (const r of s.archive) for (const x of r.termStats) byTerm.set(x.termCode, x);
  for (const x of s.termStats) byTerm.set(x.termCode, x);
  return [...byTerm.values()].sort((a, b) => a.termCode.localeCompare(b.termCode));
}

const CUMULATIVE = /^cum/i;
function cumulative(stats: TermStats[]): number | undefined {
  for (const x of [...stats].reverse()) {
    const hit = Object.entries(x.raw).find(([k]) => CUMULATIVE.test(k) && /GPA$/.test(k));
    const n = hit ? Number(hit[1]) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function record(s: Snapshot, limit: number): RecordView {
  const term = currentTerm(s)?.code;
  const now = s.attendance.filter(a => a.termCode === term && a.scope === 'semester');
  const stats = allStats(s);
  const withGpa = stats.filter(x => x.gpa != null);
  const latest = withGpa.find(x => x.termCode === term) ?? withGpa.at(-1);
  const before = latest ? withGpa.filter(x => x.termCode < latest.termCode).at(-1) : undefined;
  const unitsPassed = stats.reduce((n, x) => n + (x.unitsPassed ?? 0), 0);
  const unitsInProgress = stats.find(x => x.termCode === term)?.unitsInProgress ?? 0;
  const worst = now.reduce<RecordView['worst']>((w, a) => (!w || a.absencePct > w.absencePct ? { courseKey: a.courseKey, absencePct: a.absencePct } : w), undefined);
  const attendance = now.length ? Math.max(0, 100 - now.reduce((n, a) => n + a.absencePct, 0) / now.length) : undefined;
  const grades = [...s.grades, ...s.archive.flatMap(r => r.grades)];

  const earned = new Set<BadgeId>();
  if (grades.some(g => g.grade)) earned.add('firstGrade');
  if (now.length && now.every(a => a.absencePct < limit / 2)) earned.add('farFromLimit');
  if (now.some(a => a.absencePct === 0)) earned.add('cleanCourse');
  if ((latest?.gpa ?? 0) >= 3.5) earned.add('gpa35');
  if (s.archive.some(r => r.grades.some(g => g.grade))) earned.add('termDone');
  if (unitsPassed >= 30) earned.add('units30');

  return { attendance, gpa: latest?.gpa, previousGpa: before?.gpa, cumulativeGpa: cumulative(stats), unitsPassed, unitsInProgress, worst, earned };
}
