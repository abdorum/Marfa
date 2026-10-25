// A complete made-up student, dated relative to "now" so every card has
// something to show. Used for demos (no real data on screen), end-to-end
// tests, and UI work without touching any real system. It has one clash on
// purpose, and a history, so the clash and the changes cards show too.
import { toIsoDate } from '../../../core/derive/time';
import type { Course, Section, SyncResult } from '../../../core/model';
import { DATA_AREAS, parseCourseKey } from '../../../core/model';
import type { AdapterManifest, SourceContext, StudentDataSource } from '../../../ports/source';

export const DEMO_MANIFEST: AdapterManifest = {
  id: 'demo',
  reads: 'Made-up data, generated on the device',
  tier: 'A',
  provides: DATA_AREAS,
  credentials: 'none',
  maintainer: 'owner',
  readOnly: true,
};

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

const sections = (physicsRoom: string): Section[] => [
  { courseKey: 'PYBIO 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3456', meetings: [{ days: [0, 2], start: h(8), end: h(9, 30), room: 'B-104' }] },
  { courseKey: 'PYBIO 101', termCode: TERM, section: 'BABL', component: 'LAB', classNbr: '3458', meetings: [{ days: [1], start: h(13), end: h(15), room: 'Lab 3' }] },
  { courseKey: 'PYPHY 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3507', meetings: [{ days: [0, 3], start: h(10), end: h(11, 30), room: physicsRoom }] },
  { courseKey: 'PYMT 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3444', meetings: [{ days: [1, 4], start: h(9), end: h(10), room: 'A-105' }] },
  { courseKey: 'PYSCS 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3357', meetings: [{ days: [2], start: h(11), end: h(13), room: 'C-001' }] },
  // Overlaps Study Skills on Tuesday at noon: the clash.
  { courseKey: 'PYAR 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3335', meetings: [{ days: [2], start: h(12), end: h(13) }] },
  { courseKey: 'PYISL 101', termCode: TERM, section: 'PBAB', component: 'LEC', classNbr: '3346', meetings: [{ days: [4], start: h(11), end: h(12) }] },
];

interface Variant {
  at: Date;
  physicsRoom: string;
  bioAbsence: number;
  arabicGrade?: string;
  termExam: boolean;
  todo: boolean;
}

function result(now: Date, v: Variant): SyncResult {
  const day = (offset: number) => toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  // Exams fall on working days (Sunday to Thursday), the first one at least `offset` days away.
  const workday = (offset: number) => {
    let k = offset;
    while ([5, 6].includes(new Date(now.getFullYear(), now.getMonth(), now.getDate() + k).getDay())) k++;
    return day(k);
  };
  // The term started on the Sunday six weeks ago.
  const termStart = -now.getDay() - 35;
  const fetchedAt = v.at.toISOString();
  const courses: Course[] = COURSES.map(([key, title, units]) => ({ key, ...parseCourseKey(key), title, units }));
  const absence: Record<string, number> = { 'PYBIO 101': v.bioAbsence, 'PYMT 101': 14.5, 'PYPHY 101': 6.25, 'PYSCS 101': 0, 'PYAR 101': 0, 'PYISL 101': 3.1 };

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
        advisor: 'Dr. Sara Alharbi',
      },
      terms: [{ code: TERM, name: 'First Semester 2026-2027', start: day(termStart), end: day(termStart + 7 * 16 - 1), current: true }],
      courses,
      sections: sections(v.physicsRoom),
      attendance: Object.entries(absence).map(([courseKey, absencePct]) => ({ courseKey, termCode: TERM, scope: 'semester', absencePct })),
      grades: COURSES.map(([courseKey, , units]) => {
        const grade = courseKey === 'PYAR 101' ? v.arabicGrade : undefined;
        return { courseKey, termCode: TERM, units, grade, points: grade ? 4 : undefined };
      }),
      termStats: [{ termCode: TERM, gpa: v.arabicGrade ? 4 : undefined, unitsTaken: v.arabicGrade ? 1 : 0, unitsInProgress: 13, raw: {} }],
      exams: [
        ...(v.termExam ? [{ courseKey: 'PYMT 101', termCode: TERM, date: workday(5), start: h(9), end: h(10, 30), room: 'Hall 2' }] : []),
        { courseKey: 'PYBIO 101', termCode: TERM, date: workday(19), start: h(9), end: h(11), room: 'Hall 1' },
      ],
      holds: [],
      todos: v.todo ? [{ kind: 'todo', title: 'Upload vaccination record' }] : [],
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
    provenance: Object.fromEntries(DATA_AREAS.map(k => [k, { status: 'fresh', fetchedAt }])),
  };
}

/** The demo student as of now. */
export const demoResult = (now: Date): SyncResult =>
  result(now, { at: now, physicsRoom: 'A-210', bioAbsence: 21, arabicGrade: 'A', termExam: true, todo: true });

/** Earlier syncs, oldest first: what the demo looked like yesterday, so today's sync has news. */
export const demoHistory = (now: Date): SyncResult[] => [
  result(now, { at: new Date(now.getTime() - 26 * 3600_000), physicsRoom: 'A-208', bioAbsence: 18.75, termExam: false, todo: false }),
];

export function createDemoSource(now: () => Date = () => new Date()): StudentDataSource {
  return {
    manifest: DEMO_MANIFEST,
    async sync(ctx: SourceContext) {
      ctx.step('extract', 'start');
      const r = demoResult(now());
      ctx.step('extract', 'ok', { ms: 0 });
      return r;
    },
  };
}
