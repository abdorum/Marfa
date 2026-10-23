// Extracted PeopleSoft pages → the canonical model.
import type { AttendanceRecord, Course, ErrorCode, Exam, GradeRecord, Provenance, Section, SectionKey, Student, SyncResult, Term, TermStats } from '../../core/model';
import { parseCourseKey } from '../../core/model';
import { num, toMinutes, usDateToIso } from './extract/dom';
import type { AttendancePage, CenterPage, ExamsPage, GradesPage } from './extract/pages';
import { INSTITUTION, PAGES, type PageKey, type PsCode } from './pages';

export interface Extracted {
  center?: CenterPage;
  grades?: GradesPage;
  attendance?: AttendancePage;
  exams?: ExamsPage;
}

const ARABIC = /[؀-ۿ]/;
const normalizeKey = (s: string) => s.split('-')[0]!.replace(/\s+/g, ' ').trim();

export function toErrorCode(code: PsCode | 'PARSE'): ErrorCode {
  return code === 'SESSION_EXPIRED' || code === 'NOT_AUTHORIZED' ? 'SESSION' : code === 'BAD_CREDENTIALS' ? 'UNAVAILABLE' : code;
}

/** The term the pages talk about: from attendance rows, else from the LMS ids ("2701-…"). */
function currentTermCode(x: Extracted): string {
  const fromAttendance = x.attendance?.rows.find(r => r.scope === 'semester' && r.term)?.term;
  const fromLms = x.center?.classes.map(c => /^(\d{4})-/.exec(c.lmsId ?? '')?.[1]).find(Boolean);
  return fromAttendance || fromLms || 'current';
}

export function mapToSnapshot(x: Extracted, failures: Partial<Record<PageKey, PsCode | 'PARSE'>>, userid: string, fetchedAt: string): SyncResult {
  const termCode = currentTermCode(x);
  const courses = new Map<string, Course>();
  const course = (key: string, extra: Partial<Course> = {}) => {
    const k = normalizeKey(key);
    if (!k) return k;
    const had = courses.get(k) ?? { key: k, ...parseCourseKey(k) };
    courses.set(k, { ...had, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== '')) });
    return k;
  };

  const data: SyncResult['data'] = {};

  if (x.center) {
    data.sections = x.center.classes.map((c): Section => ({
      courseKey: course(c.course, { lmsId: c.lmsId }),
      termCode,
      section: c.section,
      component: c.component,
      classNbr: c.classNbr || undefined,
      meetings: c.meetings,
    }));
    data.holds = x.center.holds.map(title => ({ kind: 'hold', title }));
    data.todos = x.center.todos.map(title => ({ kind: 'todo', title }));
  }

  if (x.grades) {
    data.grades = x.grades.classes.filter(g => g.course).map((g): GradeRecord => ({
      courseKey: course(g.course, { title: g.title, units: g.units }),
      termCode,
      grade: g.grade || undefined,
      points: g.points,
      units: g.units,
    }));
    const s = x.grades.stats;
    const pick = (re: RegExp) => num(Object.entries(s).find(([k]) => re.test(k))?.[1] ?? '');
    const stats: TermStats = {
      termCode,
      gpa: pick(/(^|\/ )GPA$/),
      unitsTaken: pick(/Toward GPA \/ Taken$/),
      unitsPassed: pick(/Toward GPA \/ Passed$/),
      unitsInProgress: pick(/Toward GPA \/ In Progress$/),
      raw: s,
    };
    data.termStats = [stats];
  }

  if (x.attendance) {
    data.attendance = x.attendance.rows.map((r): AttendanceRecord => ({
      courseKey: course(r.course, { title: r.title }),
      termCode: r.term || termCode,
      scope: r.scope,
      absencePct: r.absencePct,
      examStatus: r.examStatus || undefined,
    }));
  }

  if (x.exams) {
    data.exams = x.exams.exams.flatMap((e): Exam[] => {
      const date = usDateToIso(e.date);
      if (!date) return [];
      const [from = '', to = ''] = e.time.split('-').map(t => t.trim());
      return [{ courseKey: course(e.course, { title: e.title }), termCode, date, start: toMinutes(from), end: toMinutes(to), room: e.room || undefined }];
    });
  }

  const term: Term = {
    code: termCode,
    name: x.grades?.term || x.exams?.term || undefined,
    start: x.attendance?.from,
    end: x.attendance?.to,
    current: true,
  };
  data.terms = termCode === 'current' && !term.name ? [] : [term];

  if (x.center || x.grades || x.attendance) data.student = student(x, userid);
  data.courses = [...courses.values()];

  return { data, provenance: provenance(x, failures, fetchedAt), fetchedAt };
}

function student(x: Extracted, userid: string): Student {
  const nameAr = x.grades?.nameAr || undefined;
  const nameEn = x.attendance?.nameEn || undefined;
  const first = x.center?.firstName || undefined;
  return {
    id: userid,
    name: { ar: nameAr, en: nameEn },
    firstName: {
      ar: first && ARABIC.test(first) ? first : nameAr?.split(' ')[0],
      en: first && !ARABIC.test(first) ? first : nameEn?.split(' ')[0],
    },
    program: x.attendance?.rows[0]?.program || undefined,
    institution: INSTITUTION,
    email: x.center?.email || undefined,
    phone: x.center?.phone || undefined,
    advisor: x.center?.advisor || undefined,
  };
}

function provenance(x: Extracted, failures: Partial<Record<PageKey, PsCode | 'PARSE'>>, fetchedAt: string) {
  const out: Partial<Record<SectionKey, Provenance>> = {};
  for (const key of Object.keys(PAGES) as PageKey[]) {
    const failure = failures[key];
    for (const section of PAGES[key].sections) {
      out[section] = x[key] && !failure
        ? { status: 'fresh', fetchedAt }
        : { status: 'error', error: toErrorCode(failure ?? 'UPSTREAM') };
    }
  }
  // The student record is assembled from several pages; it is fresh if any of them arrived.
  if (x.center || x.grades || x.attendance) out.student = { status: 'fresh', fetchedAt };
  return out;
}
