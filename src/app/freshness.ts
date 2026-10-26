// When an area is worth reading again. Opening the app reads only what is
// due, so a morning when every student opens it at once asks the college for
// a page or two each, not all of them. A refresh the student asks for reads
// everything.
import type { DataArea, Snapshot } from '../core/model';

/**
 * How long each area keeps, at least, in minutes. The rest follow the general
 * limit (15 minutes, or what the owner set for exam weeks). The schedule and
 * notices change any day; attendance and grades a few times a week; the exam
 * timetable rarely.
 */
const KEEPS: Partial<Record<DataArea, number>> = { attendance: 120, grades: 120, exams: 720, extras: 1440 };

export function dueAreas(s: Snapshot | undefined, now: number, staleMs: number): DataArea[] {
  if (!s) return [];
  return (Object.keys(s.provenance) as DataArea[]).filter(area => {
    const p = s.provenance[area];
    if (!p?.fetchedAt || p.status !== 'fresh') return true;
    return now - Date.parse(p.fetchedAt) > Math.max(staleMs, (KEEPS[area] ?? 0) * 60_000);
  });
}
