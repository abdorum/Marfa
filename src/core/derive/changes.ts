// What a sync changed (Docs/21: the Japanese portals' badges, Estonia's
// notifications): the source shows the present, the student wants the news.
import type { Change, Snapshot } from '../model';
import { currentTerm } from './schedule';
import { DAY_MS } from './time';

/** Changes are kept this long, and at most this many. */
export const CHANGES_KEEP_DAYS = 14;
export const CHANGES_MAX = 60;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Draft = DistributiveOmit<Change, 'id' | 'at'>;

/**
 * Differences between two snapshots of the same term. Only areas the new sync
 * refreshed can differ: a failed area keeps its old data, so it changes nothing.
 */
export function diffSnapshots(prev: Snapshot, next: Snapshot, at: string): Change[] {
  const term = currentTerm(next)?.code;
  if (!term || currentTerm(prev)?.code !== term) return [];
  const out: Draft[] = [];
  const inTerm = <T extends { termCode: string }>(xs: T[]) => xs.filter(x => x.termCode === term);

  // Grades posted or changed.
  const oldGrades = new Map(inTerm(prev.grades).map(g => [g.courseKey, g.grade]));
  for (const g of inTerm(next.grades)) {
    const was = oldGrades.get(g.courseKey);
    if (g.grade && g.grade !== was) out.push({ kind: 'grade', courseKey: g.courseKey, from: was, to: g.grade });
  }

  // Absence that went up.
  const oldAbs = new Map(inTerm(prev.attendance).filter(a => a.scope === 'semester').map(a => [a.courseKey, a.absencePct]));
  for (const a of inTerm(next.attendance)) {
    const was = oldAbs.get(a.courseKey);
    if (a.scope === 'semester' && was != null && a.absencePct > was) out.push({ kind: 'absence', courseKey: a.courseKey, from: was, to: a.absencePct });
  }

  // Classes added, removed, moved to another time or room.
  const classKey = (x: { courseKey: string; component: string; section: string }) => `${x.courseKey}|${x.component}|${x.section}`;
  const oldSections = new Map(inTerm(prev.sections).map(x => [classKey(x), x]));
  const newSections = new Map(inTerm(next.sections).map(x => [classKey(x), x]));
  const slots = (x: { meetings: { days: number[]; start: number; end: number }[] }) =>
    x.meetings.flatMap(m => m.days.map(d => `${d}@${m.start}-${m.end}`)).sort().join(',');
  const rooms = (x: { meetings: { room?: string }[] }) => [...new Set(x.meetings.map(m => m.room ?? ''))].sort().join(',');
  for (const [k, x] of newSections) {
    const was = oldSections.get(k);
    if (!was) out.push({ kind: 'class-added', courseKey: x.courseKey, component: x.component });
    else if (slots(was) !== slots(x)) out.push({ kind: 'time', courseKey: x.courseKey, component: x.component });
    else if (rooms(was) !== rooms(x)) out.push({ kind: 'room', courseKey: x.courseKey, component: x.component, to: x.meetings.find(m => m.room)?.room });
  }
  for (const [k, x] of oldSections) if (!newSections.has(k)) out.push({ kind: 'class-removed', courseKey: x.courseKey, component: x.component });

  // Exams announced, moved or withdrawn.
  const oldExams = new Map(inTerm(prev.exams).map(e => [e.courseKey, e]));
  const newExams = new Map(inTerm(next.exams).map(e => [e.courseKey, e]));
  for (const [k, e] of newExams) {
    const was = oldExams.get(k);
    if (!was) out.push({ kind: 'exam-added', courseKey: k, date: e.date, start: e.start });
    else if (was.date !== e.date || was.start !== e.start || was.room !== e.room) out.push({ kind: 'exam-changed', courseKey: k, date: e.date, start: e.start });
  }
  for (const k of oldExams.keys()) if (!newExams.has(k)) out.push({ kind: 'exam-removed', courseKey: k });

  // Holds and to-dos.
  for (const [kind, before, after] of [['hold', prev.holds, next.holds], ['todo', prev.todos, next.todos]] as const) {
    const was = new Set(before.map(n => n.title));
    const now = new Set(after.map(n => n.title));
    for (const t of now) if (!was.has(t)) out.push({ kind: `${kind}-added`, title: t });
    for (const t of was) if (!now.has(t)) out.push({ kind: `${kind}-removed`, title: t });
  }

  // GPA.
  const gpa = (x: Snapshot) => x.termStats.find(t => t.termCode === term)?.gpa;
  const g0 = gpa(prev);
  const g1 = gpa(next);
  if (g1 != null && g0 !== g1) out.push({ kind: 'gpa', from: g0, to: g1 });

  return out.map((c, i) => ({ ...c, at, id: `${at}#${i}` }) as Change);
}

/** New changes first; old ones fall off after two weeks. */
export function keepChanges(found: Change[], before: Change[], now: string): Change[] {
  const cutoff = Date.parse(now) - CHANGES_KEEP_DAYS * DAY_MS;
  return [...found, ...before].filter(c => Date.parse(c.at) >= cutoff).slice(0, CHANGES_MAX);
}
