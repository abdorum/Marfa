// Courses with everything known about them, and a fixed color for each, so
// the student knows a course by its color before reading its name.
import { componentOrder } from '../components';
import type { AttendanceRecord, Course, Exam, GradeRecord, Section, Snapshot } from '../model';
import { attendanceLevel, type Level } from './attendance';
import { currentTerm } from './schedule';

export interface CoursePrefs {
  absenceLimit: number;
}

export interface CourseRow {
  course: Course;
  sections: Section[];
  /** The course's components, lecture first: "LEC", "LAB"… */
  components: string[];
  attendance?: AttendanceRecord;
  grade?: GradeRecord;
  exam?: Exam;
  level: Level;
}

/** Every course in a term with what we know about it; most absences first. */
export function courseList(s: Snapshot, prefs: CoursePrefs, termCode = currentTerm(s)?.code): CourseRow[] {
  const keys = new Set<string>();
  const inTerm = (x: { termCode: string }) => !termCode || x.termCode === termCode;
  for (const sec of s.sections) if (inTerm(sec)) keys.add(sec.courseKey);
  for (const g of s.grades) if (inTerm(g)) keys.add(g.courseKey);
  for (const a of s.attendance) if (inTerm(a)) keys.add(a.courseKey);
  return [...keys]
    .map(k => courseView(s, k, prefs, termCode))
    .filter((r): r is CourseRow => !!r)
    .sort((a, b) => (b.attendance?.absencePct ?? -1) - (a.attendance?.absencePct ?? -1) || a.course.key.localeCompare(b.course.key));
}

export function courseView(s: Snapshot, key: string, prefs: CoursePrefs, termCode = currentTerm(s)?.code): CourseRow | undefined {
  const inTerm = <T extends { termCode: string; courseKey: string }>(x: T) => x.courseKey === key && (!termCode || x.termCode === termCode);
  const sections = s.sections.filter(inTerm).sort((a, b) => componentOrder(a.component, b.component));
  const attendance = s.attendance.filter(inTerm).find(a => a.scope === 'semester') ?? s.attendance.find(inTerm);
  const grade = s.grades.find(inTerm);
  const exam = s.exams.filter(inTerm).sort((a, b) => a.date.localeCompare(b.date))[0];
  const course = s.courses.find(c => c.key === key);
  if (!course && !sections.length && !attendance && !grade) return undefined;
  return {
    course: course ?? { key, subject: key.split(' ')[0] ?? key, catalog: key.split(' ')[1] ?? '' },
    sections,
    components: [...new Set(sections.map(x => x.component))].sort(componentOrder),
    attendance, grade, exam,
    level: attendance ? attendanceLevel(attendance.absencePct, prefs.absenceLimit) : 'ok',
  };
}

/**
 * A palette index for every course: stable for a course (from a hash of its
 * code), and distinct among the courses the student has, as long as the
 * palette is large enough.
 */
export function courseColors(s: Pick<Snapshot, 'sections' | 'courses'>, paletteSize: number): Map<string, number> {
  const keys = [...new Set([...s.sections.map(x => x.courseKey), ...s.courses.map(c => c.key)])].sort();
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const key of keys) {
    let i = hash(key) % paletteSize;
    for (let k = 0; k < paletteSize && used.has(i); k++) i = (i + 1) % paletteSize;
    used.add(i);
    out.set(key, i);
  }
  return out;
}

/** FNV-1a. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
