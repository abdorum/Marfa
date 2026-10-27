// The canonical student data model (Docs/07-data-model.md). Every source
// adapter produces this shape; nothing above the adapters sees anything
// source-specific.

export const SCHEMA_VERSION = 2;

/** The adapter that produced the data: 'peoplesoft', 'official', 'demo', … */
export type SourceId = string;

/** A part of the snapshot that is refreshed as a whole (Docs/17: مجال البيانات). */
export type DataArea = 'student' | 'schedule' | 'attendance' | 'grades' | 'exams' | 'notices' | 'extras';
export const DATA_AREAS: readonly DataArea[] = ['student', 'schedule', 'attendance', 'grades', 'exams', 'notices', 'extras'];

export type ErrorCode = 'SESSION' | 'TIMEOUT' | 'PARSE' | 'UPSTREAM' | 'UNAVAILABLE';

export interface Provenance {
  status: 'fresh' | 'stale' | 'error' | 'missing';
  fetchedAt?: string;
  error?: ErrorCode;
}

export interface Localized {
  ar?: string;
  en?: string;
}

export interface Student {
  id: string;
  name: Localized;
  firstName: Localized;
  program?: string;
  institution: string;
  email?: string;
  phone?: string;
  advisor?: string;
  /** What the source lists as available to this student, e.g. "Enrollment: Add". */
  capabilities?: string[];
}

export interface Term {
  code: string;
  name?: string;
  /** ISO date (YYYY-MM-DD). */
  start?: string;
  end?: string;
  current: boolean;
}

export interface Course {
  /** "PYBIO 101": subject and catalog number, the whole code (normalizeCourseKey). */
  key: string;
  subject: string;
  catalog: string;
  /** As in the source; never machine-translated. */
  title?: string;
  units?: number;
  lmsId?: string;
}

export interface Meeting {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  /** Minutes since midnight. */
  start: number;
  end: number;
  room?: string;
}

/** The class a student is enrolled in: one component (lecture, lab…) of a course. */
export interface Section {
  courseKey: string;
  termCode: string;
  section: string;
  component: string;
  classNbr?: string;
  meetings: Meeting[];
}

export interface AttendanceRecord {
  courseKey: string;
  termCode: string;
  scope: 'semester' | 'year';
  absencePct: number;
  /** Set by the source when absence bars the student from the exam. */
  examStatus?: string;
}

export interface GradeRecord {
  courseKey: string;
  termCode: string;
  /** undefined = not posted yet */
  grade?: string;
  points?: number;
  units?: number;
}

export interface TermStats {
  termCode: string;
  gpa?: number;
  unitsTaken?: number;
  unitsPassed?: number;
  unitsInProgress?: number;
  raw: Record<string, string>;
}

export interface Exam {
  courseKey: string;
  termCode: string;
  /** ISO date */
  date: string;
  start?: number;
  end?: number;
  room?: string;
}

export interface Notice {
  kind: 'hold' | 'todo';
  title: string;
  detail?: string;
}

export interface ExtraBlock {
  /** Stable fingerprint, e.g. "center:DERIVED_X" */
  id: string;
  title: string;
  /** Translated titles, once a block is promoted in the source's registry. */
  titles?: Localized;
  kind: 'table' | 'fields' | 'list' | 'link';
  columns?: string[];
  rows?: string[][];
  fields?: { label: string; value: string }[];
  href?: string;
  firstSeen: string;
  lastSeen: string;
  /** Successful syncs in a row that did not include this block. */
  missed?: number;
}

/** A term the source has moved on from, kept on the device (Docs/17: الأرشيف). */
export interface TermRecord {
  term: Term;
  courses: Course[];
  sections: Section[];
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  termStats: TermStats[];
  exams: Exam[];
  archivedAt: string;
}

/** Something that differs from the previous sync (Docs/17: التغيّر). */
export type Change = { id: string; at: string } & (
  | { kind: 'grade'; courseKey: string; from?: string; to: string }
  | { kind: 'absence'; courseKey: string; from: number; to: number }
  | { kind: 'room'; courseKey: string; component: string; to?: string }
  | { kind: 'time'; courseKey: string; component: string }
  | { kind: 'class-added' | 'class-removed'; courseKey: string; component: string }
  | { kind: 'exam-added' | 'exam-changed'; courseKey: string; date: string; start?: number }
  | { kind: 'exam-removed'; courseKey: string }
  | { kind: 'hold-added' | 'hold-removed' | 'todo-added' | 'todo-removed'; title: string }
  | { kind: 'gpa'; from?: number; to: number }
);


export interface Snapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  source: SourceId;
  student?: Student;
  terms: Term[];
  courses: Course[];
  sections: Section[];
  attendance: AttendanceRecord[];
  grades: GradeRecord[];
  termStats: TermStats[];
  exams: Exam[];
  holds: Notice[];
  todos: Notice[];
  extras: ExtraBlock[];
  provenance: Partial<Record<DataArea, Provenance>>;
  /** Earlier terms, newest first. */
  archive: TermRecord[];
  /** What recent syncs changed, newest first. */
  changes: Change[];
}

/** Which snapshot fields each data area owns. A fresh area replaces exactly these. */
export const AREA_FIELDS = {
  student: ['student'],
  schedule: ['sections'],
  attendance: ['attendance'],
  grades: ['grades', 'termStats'],
  exams: ['exams'],
  notices: ['holds', 'todos'],
  extras: ['extras'],
} as const satisfies Record<DataArea, readonly (keyof Snapshot)[]>;

/** What one sync produces: data for the areas it reached, plus reference data. */
export interface SyncResult {
  data: Partial<Omit<Snapshot, 'schemaVersion' | 'source' | 'provenance' | 'archive' | 'changes'>>;
  provenance: Partial<Record<DataArea, Provenance>>;
  fetchedAt: string;
}

export function emptySnapshot(source: SourceId): Snapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    terms: [],
    courses: [],
    sections: [],
    attendance: [],
    grades: [],
    termStats: [],
    exams: [],
    holds: [],
    todos: [],
    extras: [],
    provenance: {},
    archive: [],
    changes: [],
  };
}

/** "PYBIO 101" ⇄ "PYBIO-101" for URLs. */
export const courseSlug = (key: string) => key.replace(/\s+/g, '-');
export const courseKeyFromSlug = (slug: string) => slug.replace(/-/g, ' ');

export function parseCourseKey(key: string): Pick<Course, 'subject' | 'catalog'> {
  const [subject = key, catalog = ''] = key.trim().split(/\s+/);
  return { subject, catalog };
}

/**
 * The whole course code, however a page writes it: "PYBIO 101", "PYBIO101",
 * "MED-101", "PYBIO 101-PBAB" (with its section), "PYBIO 101 (3456)" → "SUBJECT
 * CATALOG". Anything that is not a code is kept whole, so two different
 * courses can never collapse into one.
 */
export function normalizeCourseKey(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  const m = /^([A-Za-z][A-Za-z&]{0,9})\s*-?\s*(\d{2,5}[A-Za-z]{0,3})(?:\s*-\s*[A-Za-z0-9]{1,8})?(?:\s*\(\s*\d+\s*\))?$/.exec(s);
  return m ? `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}` : s;
}
