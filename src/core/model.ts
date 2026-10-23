// The canonical student data model (Docs/07-data-model.md). Every source
// adapter produces this shape; the UI never sees anything source-specific.

export const SCHEMA_VERSION = 1;

export type SourceId = 'peoplesoft' | 'official' | 'demo';

export type SectionKey = 'student' | 'schedule' | 'attendance' | 'grades' | 'exams' | 'notices' | 'extras';
export const SECTION_KEYS: readonly SectionKey[] = ['student', 'schedule', 'attendance', 'grades', 'exams', 'notices', 'extras'];

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
  /** "PYBIO 101" */
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
  provenance: Partial<Record<SectionKey, Provenance>>;
}

/** Which snapshot fields each section owns. A fresh section replaces exactly these. */
export const SECTION_FIELDS = {
  student: ['student'],
  schedule: ['sections'],
  attendance: ['attendance'],
  grades: ['grades', 'termStats'],
  exams: ['exams'],
  notices: ['holds', 'todos'],
  extras: ['extras'],
} as const satisfies Record<SectionKey, readonly (keyof Snapshot)[]>;

/** What one sync produces: data for the sections it reached, plus reference data. */
export interface SyncResult {
  data: Partial<Omit<Snapshot, 'schemaVersion' | 'source' | 'provenance'>>;
  provenance: Partial<Record<SectionKey, Provenance>>;
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
  };
}

/** "PYBIO 101" ⇄ "PYBIO-101" for URLs. */
export const courseSlug = (key: string) => key.replace(/\s+/g, '-');
export const courseKeyFromSlug = (slug: string) => slug.replace(/-/g, ' ');

export function parseCourseKey(key: string): Pick<Course, 'subject' | 'catalog'> {
  const [subject = key, catalog = ''] = key.trim().split(/\s+/);
  return { subject, catalog };
}
