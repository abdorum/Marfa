// Pure calculations over a snapshot. No state, no I/O: everything a screen
// shows that is not stored data comes from here.
import type { AttendanceRecord, Course, Exam, GradeRecord, Notice, Section, Snapshot, Term } from './model';

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function currentTerm(s: Snapshot): Term | undefined {
  return s.terms.find(t => t.current) ?? s.terms[s.terms.length - 1];
}

/** Week number since the term started (week 1 = first week), or undefined if unknown. */
export function academicWeek(term: Term | undefined, now: Date): number | undefined {
  if (!term?.start) return undefined;
  const start = fromIsoDate(term.start);
  const days = Math.floor((fromIsoDate(toIsoDate(now)).getTime() - start.getTime()) / DAY_MS);
  return days < 0 ? undefined : Math.floor(days / 7) + 1;
}

export interface MeetingView {
  courseKey: string;
  title?: string;
  termCode: string;
  section: string;
  component: string;
  start: number;
  end: number;
  room?: string;
}

export type MeetingState = 'past' | 'now' | 'next' | 'later';

function courseIndex(s: Snapshot): Map<string, Course> {
  return new Map(s.courses.map(c => [c.key, c]));
}

/** Meetings on a given date, in the current term, sorted by start time, duplicates removed. */
export function meetingsOn(s: Snapshot, date: Date): MeetingView[] {
  const term = currentTerm(s)?.code;
  const courses = courseIndex(s);
  const day = date.getDay();
  const seen = new Set<string>();
  const out: MeetingView[] = [];
  for (const sec of s.sections) {
    if (term && sec.termCode !== term) continue;
    for (const m of sec.meetings) {
      if (!m.days.includes(day)) continue;
      const key = `${sec.courseKey}|${sec.component}|${m.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        courseKey: sec.courseKey, title: courses.get(sec.courseKey)?.title, termCode: sec.termCode,
        section: sec.section, component: sec.component, start: m.start, end: m.end, room: m.room,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Today's meetings with their state relative to now. */
export function withStates(list: MeetingView[], now: Date): (MeetingView & { state: MeetingState })[] {
  const t = minutesOfDay(now);
  const nextIdx = list.findIndex(m => m.start > t);
  return list.map((m, i) => ({
    ...m,
    state: m.end <= t ? 'past' : m.start <= t ? 'now' : i === nextIdx ? 'next' : 'later',
  }));
}

/** The next meeting that has not started yet, looking up to `horizonDays` ahead. */
export function nextMeeting(s: Snapshot, now: Date, horizonDays = 7): { meeting: MeetingView; date: Date } | undefined {
  for (let k = 0; k <= horizonDays; k++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k);
    const list = meetingsOn(s, date).filter(m => k > 0 || m.start > minutesOfDay(now));
    if (list.length) return { meeting: list[0]!, date };
  }
  return undefined;
}

export type Level = 'ok' | 'warn' | 'risk';

/** Half the limit is a warning; 80% of it is a risk. */
export function attendanceLevel(pct: number, limit: number): Level {
  const ratio = limit > 0 ? pct / limit : 0;
  return ratio >= 0.8 ? 'risk' : ratio >= 0.5 ? 'warn' : 'ok';
}

export interface Prefs {
  absenceLimit: number;
}

export type Alert =
  | { kind: 'hold' | 'todo'; notice: Notice }
  | { kind: 'attendance'; record: AttendanceRecord; level: Exclude<Level, 'ok'> }
  | { kind: 'exam'; exam: Exam; inDays: number };

export function alerts(s: Snapshot, prefs: Prefs, now: Date): Alert[] {
  const out: Alert[] = [];
  for (const n of s.holds) out.push({ kind: 'hold', notice: n });
  for (const n of s.todos) out.push({ kind: 'todo', notice: n });
  const term = currentTerm(s)?.code;
  for (const r of s.attendance) {
    if (term && r.termCode !== term) continue;
    const level = attendanceLevel(r.absencePct, prefs.absenceLimit);
    if (level !== 'ok') out.push({ kind: 'attendance', record: r, level });
  }
  const today = fromIsoDate(toIsoDate(now)).getTime();
  for (const e of s.exams) {
    const inDays = Math.round((fromIsoDate(e.date).getTime() - today) / DAY_MS);
    if (inDays >= 0 && inDays <= 7) out.push({ kind: 'exam', exam: e, inDays });
  }
  // Holds first, then absence risk, exams, absence warnings, to-dos.
  const rank = (a: Alert) =>
    a.kind === 'hold' ? 0 : a.kind === 'attendance' ? (a.level === 'risk' ? 1 : 3) : a.kind === 'exam' ? 2 : 4;
  return out.sort((a, b) => rank(a) - rank(b));
}

export interface CourseRow {
  course: Course;
  sections: Section[];
  attendance?: AttendanceRecord;
  grade?: GradeRecord;
  exam?: Exam;
  level: Level;
}

/** Every course in a term with what we know about it; most absences first. */
export function courseList(s: Snapshot, prefs: Prefs, termCode = currentTerm(s)?.code): CourseRow[] {
  const keys = new Set<string>();
  for (const sec of s.sections) if (!termCode || sec.termCode === termCode) keys.add(sec.courseKey);
  for (const g of s.grades) if (!termCode || g.termCode === termCode) keys.add(g.courseKey);
  for (const a of s.attendance) if (!termCode || a.termCode === termCode) keys.add(a.courseKey);
  return [...keys]
    .map(k => courseView(s, k, prefs, termCode))
    .filter((r): r is CourseRow => !!r)
    .sort((a, b) => (b.attendance?.absencePct ?? -1) - (a.attendance?.absencePct ?? -1) || a.course.key.localeCompare(b.course.key));
}

export function courseView(s: Snapshot, key: string, prefs: Prefs, termCode = currentTerm(s)?.code): CourseRow | undefined {
  const inTerm = <T extends { termCode: string; courseKey: string }>(x: T) => x.courseKey === key && (!termCode || x.termCode === termCode);
  const sections = s.sections.filter(inTerm);
  const attendance = s.attendance.filter(inTerm).find(a => a.scope === 'semester') ?? s.attendance.find(inTerm);
  const grade = s.grades.find(inTerm);
  const exam = s.exams.find(inTerm);
  const course = s.courses.find(c => c.key === key);
  if (!course && !sections.length && !attendance && !grade) return undefined;
  return {
    course: course ?? { key, subject: key.split(' ')[0] ?? key, catalog: key.split(' ')[1] ?? '' },
    sections, attendance, grade, exam,
    level: attendance ? attendanceLevel(attendance.absencePct, prefs.absenceLimit) : 'ok',
  };
}

/** Stable pick from the avatar list for a student (FNV-1a hash of the ID). */
export function avatarFor(studentId: string, avatars: readonly string[]): string | undefined {
  if (!avatars.length) return undefined;
  let h = 0x811c9dc5;
  for (let i = 0; i < studentId.length; i++) {
    h ^= studentId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return avatars[h % avatars.length];
}
