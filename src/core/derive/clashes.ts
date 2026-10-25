// Clashes (Docs/21: NUSMods): two classes in the same slot, or two exams at the
// same time. The source never says so; the student finds out at the door.
import type { Exam, Snapshot } from '../model';
import { currentTerm, meetingsOnDay, type MeetingView } from './schedule';

export type Clash =
  | { kind: 'class'; day: number; a: MeetingView; b: MeetingView; start: number; end: number }
  | { kind: 'exam'; date: string; a: Exam; b: Exam; start?: number; end?: number };

/** The same class listed twice is not a clash with itself. */
const sameClass = (a: MeetingView, b: MeetingView) => a.courseKey === b.courseKey && a.section === b.section && a.component === b.component;

export function clashes(s: Snapshot): Clash[] {
  const out: Clash[] = [];
  for (let day = 0; day < 7; day++) {
    const list = meetingsOnDay(s, day);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j]!.start < list[i]!.end; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (sameClass(a, b)) continue;
        out.push({ kind: 'class', day, a, b, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) });
      }
    }
  }
  const term = currentTerm(s)?.code;
  const exams = s.exams.filter(e => !term || e.termCode === term).sort((x, y) => x.date.localeCompare(y.date) || (x.start ?? 0) - (y.start ?? 0));
  for (let i = 0; i < exams.length; i++) {
    for (let j = i + 1; j < exams.length && exams[j]!.date === exams[i]!.date; j++) {
      const a = exams[i]!;
      const b = exams[j]!;
      if (a.courseKey === b.courseKey) continue;
      // Without times, two exams on one day are only worth a look, not a clash.
      if (a.start == null || b.start == null || a.end == null || b.end == null) continue;
      if (a.start < b.end && b.start < a.end) out.push({ kind: 'exam', date: a.date, a, b, start: Math.max(a.start, b.start), end: Math.min(a.end, b.end) });
    }
  }
  return out;
}

/** "day|meeting id" for every class involved in a clash, to mark it wherever it shows. */
export function clashingMeetings(list: Clash[]): Set<string> {
  const ids = new Set<string>();
  for (const c of list) if (c.kind === 'class') { ids.add(`${c.day}|${c.a.id}`); ids.add(`${c.day}|${c.b.id}`); }
  return ids;
}
