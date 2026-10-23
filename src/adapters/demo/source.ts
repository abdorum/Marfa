// A complete made-up student, dated relative to "now" so every screen has
// something to show. Used for demos to the college (no real data on screen),
// end-to-end tests, and UI work without touching PeopleSoft.
import { toIsoDate } from '../../core/derive';
import type { Course, Section, SyncResult } from '../../core/model';
import { parseCourseKey } from '../../core/model';
import type { SourceContext, StudentDataSource } from '../ports';

const TERM = '2701';
const h = (hh: number, mm = 0) => hh * 60 + mm;

const COURSES: [key: string, title: string, units: number][] = [
  ['PYBIO 101', 'Human Biology', 4],
  ['PYPHY 101', 'General Physics', 3],
  ['PYMT 101', 'Medical Terminology', 2],
  ['PYSCS 101', 'Study & Communication Skills', 2],
  ['PYAR 101', 'Arabic Language', 1],
  ['PYISL 101', 'Islamic Culture', 1],
];

const SECTIONS: Section[] = [
  { courseKey: 'PYBIO 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3456', meetings: [{ days: [0, 2], start: h(8), end: h(9, 30), room: 'B-104' }] },
  { courseKey: 'PYBIO 101', termCode: TERM, section: 'BABL', component: 'LAB', classNbr: '3458', meetings: [{ days: [1], start: h(13), end: h(15), room: 'Lab 3' }] },
  { courseKey: 'PYPHY 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3507', meetings: [{ days: [0, 3], start: h(10), end: h(11, 30), room: 'A-210' }] },
  { courseKey: 'PYMT 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3444', meetings: [{ days: [1, 4], start: h(9), end: h(10), room: 'A-105' }] },
  { courseKey: 'PYSCS 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3357', meetings: [{ days: [2], start: h(11), end: h(13), room: 'C-001' }] },
  { courseKey: 'PYAR 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3335', meetings: [{ days: [3], start: h(13), end: h(14) }] },
  { courseKey: 'PYISL 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3346', meetings: [{ days: [4], start: h(11), end: h(12) }] },
];

export function demoResult(now: Date): SyncResult {
  const day = (offset: number) => toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  // The term started on the Sunday six weeks ago.
  const termStart = -now.getDay() - 35;
  const fetchedAt = now.toISOString();
  const courses: Course[] = COURSES.map(([key, title, units]) => ({ key, ...parseCourseKey(key), title, units }));
  const absence: Record<string, number> = { 'PYBIO 101': 21, 'PYMT 101': 14.5, 'PYPHY 101': 6.25, 'PYSCS 101': 0, 'PYAR 101': 0, 'PYISL 101': 3.1 };

  return {
    fetchedAt,
    data: {
      student: {
        id: '20000000',
        name: { ar: 'أحمد صالح العتيبي', en: 'Ahmed Saleh Alotaibi' },
        firstName: { ar: 'أحمد', en: 'Ahmed' },
        program: 'FAST',
        institution: 'Batterjee Medical College',
        email: 'student@example.com',
      },
      terms: [{ code: TERM, name: 'First Semester 2026-2027', start: day(termStart), end: day(termStart + 7 * 16 - 1), current: true }],
      courses,
      sections: SECTIONS,
      attendance: Object.entries(absence).map(([courseKey, absencePct]) => ({ courseKey, termCode: TERM, scope: 'semester', absencePct })),
      grades: COURSES.map(([courseKey, , units]) => ({ courseKey, termCode: TERM, units, grade: courseKey === 'PYAR 101' ? 'A' : undefined, points: courseKey === 'PYAR 101' ? 4 : undefined })),
      termStats: [{ termCode: TERM, unitsInProgress: 13, raw: { 'Units Toward GPA / In Progress': '13.000' } }],
      exams: [
        { courseKey: 'PYMT 101', termCode: TERM, date: day(5), start: h(9), end: h(10, 30), room: 'Hall 2' },
        { courseKey: 'PYBIO 101', termCode: TERM, date: day(19), start: h(9), end: h(11), room: 'Hall 1' },
      ],
      holds: [],
      todos: [{ kind: 'todo', title: 'Upload vaccination record' }],
      extras: [{
        id: 'demo:ACADEMIC_CALENDAR',
        title: 'Academic Calendar',
        kind: 'table',
        columns: ['Date', 'Event'],
        rows: [[day(12), 'Add/Drop deadline'], [day(40), 'Midterm break']],
        firstSeen: fetchedAt,
        lastSeen: fetchedAt,
      }],
    },
    provenance: Object.fromEntries(
      (['student', 'schedule', 'attendance', 'grades', 'exams', 'notices', 'extras'] as const).map(k => [k, { status: 'fresh', fetchedAt }]),
    ),
  };
}

export function createDemoSource(now: () => Date = () => new Date()): StudentDataSource {
  return {
    id: 'demo',
    async sync(ctx: SourceContext) {
      ctx.step('SIGN IN', 'ok', { ms: 0 });
      return demoResult(now());
    },
  };
}
