// What needs the student's attention now, most urgent first.
import type { AttendanceRecord, Exam, Notice, Snapshot } from '../model';
import { attendanceLevel, type Level } from './attendance';
import { clashes, type Clash } from './clashes';
import { currentTerm } from './schedule';
import { daysBetween, fromIsoDate } from './time';

export type Alert =
  | { kind: 'hold' | 'todo'; notice: Notice }
  | { kind: 'attendance'; record: AttendanceRecord; level: Exclude<Level, 'ok'> }
  | { kind: 'barred'; record: AttendanceRecord }
  | { kind: 'exam'; exam: Exam; inDays: number }
  | { kind: 'clash'; clash: Clash };

const RANK: Record<Alert['kind'], number> = { barred: 0, hold: 1, attendance: 2, clash: 3, exam: 4, todo: 6 };

export function alerts(s: Snapshot, prefs: { absenceLimit: number }, now: Date): Alert[] {
  const out: Alert[] = [];
  for (const n of s.holds) out.push({ kind: 'hold', notice: n });
  for (const n of s.todos) out.push({ kind: 'todo', notice: n });
  const term = currentTerm(s)?.code;
  for (const r of s.attendance) {
    if (term && r.termCode !== term) continue;
    if (r.examStatus) { out.push({ kind: 'barred', record: r }); continue; }
    const level = attendanceLevel(r.absencePct, prefs.absenceLimit);
    if (level !== 'ok') out.push({ kind: 'attendance', record: r, level });
  }
  for (const e of s.exams) {
    const inDays = daysBetween(now, fromIsoDate(e.date));
    if (inDays >= 0 && inDays <= 7) out.push({ kind: 'exam', exam: e, inDays });
  }
  for (const c of clashes(s)) out.push({ kind: 'clash', clash: c });
  // Within a kind: risk before warning, the nearest exam first.
  const within = (a: Alert) => (a.kind === 'attendance' ? (a.level === 'risk' ? 0 : 1) : a.kind === 'exam' ? a.inDays : 0);
  return out.sort((a, b) => rankOf(a) - rankOf(b) || within(a) - within(b));
}

/** Absence warnings sort after close exams; absence risks before them. */
const rankOf = (a: Alert) => (a.kind === 'attendance' && a.level === 'warn' ? 5 : RANK[a.kind]);
