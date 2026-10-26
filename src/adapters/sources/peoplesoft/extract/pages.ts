// One extractor per allowlisted page. Output stays close to the page; turning
// it into the canonical model is map.ts's job. Field ids are documented in
// Docs/10-peoplesoft-notes.md.
import { cellsOf, clean, landmark, lines, num, parseDays, rows, text, toMinutes, usDateToIso } from './dom';

export interface CenterPage {
  firstName: string;
  classes: {
    course: string;
    section: string;
    component: string;
    classNbr: string;
    lmsId?: string;
    meetings: { days: number[]; start: number; end: number; room?: string }[];
  }[];
  email: string;
  phone: string;
  advisor: string;
  holds: string[];
  todos: string[];
}

export function extractCenter(doc: Document): CenterPage {
  landmark(doc, 'center', ['DERIVED_SSS_SCL_TITLE1$78$']);
  const classes = rows(doc, i => `CLASS_NAME$span$${i}`).map(i => {
    const [nameLine = '', compLine = ''] = lines(doc, `CLASS_NAME$span$${i}`);
    const dash = nameLine.lastIndexOf('-');
    const course = (dash > 0 ? nameLine.slice(0, dash) : nameLine).trim();
    const section = dash > 0 ? nameLine.slice(dash + 1).trim() : '';
    const comp = /^(\w+)\s*\((\d+)\)/.exec(compLine);
    const meetings: CenterPage['classes'][number]['meetings'] = [];
    for (const line of lines(doc, `DERIVED_SSS_SCL_SSR_MTG_SCHED_LONG$${i}`)) {
      const m = /^([A-Za-z]+)\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(line);
      const start = m && toMinutes(m[2]!);
      const end = m && toMinutes(m[3]!);
      if (m && start != null && end != null) meetings.push({ days: parseDays(m[1]!), start, end });
      else if (meetings.length && /^Room/i.test(line)) {
        const room = line.replace(/^Room\s*/i, '').trim();
        meetings[meetings.length - 1]!.room = room && room !== 'TBA' ? room : undefined;
      }
    }
    const lms = doc.getElementById(`LMS$${i}`);
    const lmsId = clean(lms?.getAttribute('href')) || clean(lms?.textContent) || undefined;
    return { course, section, component: comp?.[1] ?? compLine, classNbr: comp?.[2] ?? '', lmsId, meetings };
  });

  // The side boxes have no row ids when empty, so they are read between headings.
  const body = clean(doc.body?.textContent);
  const between = (from: string, to: string) => {
    const i = body.indexOf(from);
    if (i < 0) return '';
    const j = body.indexOf(to, i + from.length);
    return body.slice(i + from.length, j < 0 ? undefined : j).trim();
  };
  const email = text(doc, 'DERIVED_SSS_SCL_EMAIL_ADDR');
  const holds = between('Holds Description', 'To Do List');
  const todos = between('To Do List Descr2', 'Advisor');
  const advisor = text(doc, 'DERIVED_SSS_SCL_NAME_DISPLAY$span$0');

  return {
    firstName: text(doc, 'DERIVED_SSS_SCL_TITLE1$78$').replace(/'s Student Center$/, ''),
    classes,
    email,
    phone: between('Home E-mail', email || 'Go').replace(/^None\b/, '').trim(),
    advisor: advisor && advisor !== 'None Assigned' ? advisor : '',
    holds: holds && !/^No Holds/i.test(holds) ? [holds.replace(/\s*details\s*$/i, '')] : [],
    todos: todos && !/^No To Do/i.test(todos) ? [todos] : [],
  };
}

export interface GradesPage {
  term: string;
  nameAr: string;
  classes: { course: string; title: string; units?: number; grade: string; points?: number }[];
  stats: Record<string, string>;
}

export function extractGrades(doc: Document): GradesPage {
  landmark(doc, 'grades', ['DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$', 'DERIVED_SSTSNAV_PERSON_NAME']);
  const classes = rows(doc, i => `CLS_LINK$${i}`).map(i => ({
    course: text(doc, `CLS_LINK$${i}`),
    title: text(doc, `CLASS_TBL_VW_DESCR$${i}`),
    units: num(text(doc, `STDNT_ENRL_SSV1_UNT_TAKEN$${i}`)),
    grade: text(doc, `STDNT_ENRL_SSV1_CRSE_GRADE_OFF$${i}`),
    points: num(text(doc, `STDNT_ENRL_SSV1_GRADE_POINTS$${i}`)),
  }));
  const stats: Record<string, string> = {};
  let group = '';
  for (const i of rows(doc, i => `STATS_ENRL$${i}`)) {
    const label = text(doc, `DERIVED_SSS_GRD_DESCR1$${i}`).replace(/:$/, '');
    const value = text(doc, `STATS_ENRL$${i}`);
    if (label && !value && /Units/i.test(label)) { group = label; continue; }
    if (label && value) stats[group ? `${group} / ${label}` : label] = value;
  }
  return {
    term: text(doc, 'DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$').split('|')[0]!.trim(),
    nameAr: text(doc, 'DERIVED_SSTSNAV_PERSON_NAME'),
    classes,
    stats,
  };
}

export interface AttendancePage {
  nameEn: string;
  from?: string;
  to?: string;
  rows: { scope: 'semester' | 'year'; program: string; term: string; course: string; title: string; absencePct: number; examStatus: string }[];
}

export function extractAttendance(doc: Document): AttendancePage {
  landmark(doc, 'attendance', ['LS_SS_PERS_SRCH_NAME_DISPLAY', 'A_SF_ATT_DER_TERM_BEGIN_DT']);
  const grid = (prefix: string, scope: 'semester' | 'year') => rows(doc, i => `${prefix}_SUBJECT$${i}`)
    .map(i => ({
      scope,
      program: text(doc, `${prefix}_ACAD_PROG$${i}`),
      term: text(doc, `${prefix}_STRM$${i}`),
      course: `${text(doc, `${prefix}_SUBJECT$${i}`)} ${text(doc, `${prefix}_CATALOG_NBR$${i}`)}`.trim(),
      title: text(doc, `${prefix}_DESCR$${i}`),
      absencePct: num(text(doc, `${prefix}_PER_ORG_DESCRSHORT$${i}`)) ?? 0,
      examStatus: text(doc, `${prefix}_DESCR10$${i}`),
    }))
    .filter(r => r.course);
  return {
    nameEn: text(doc, 'LS_SS_PERS_SRCH_NAME_DISPLAY'),
    from: usDateToIso(text(doc, 'A_SF_ATT_DER_TERM_BEGIN_DT')),
    to: usDateToIso(text(doc, 'A_SF_ATT_DER_END_DATE')),
    rows: [...grid('A_SLF_ATT_PR_VW', 'semester'), ...grid('A_SLF_ATT_YR_VW', 'year')],
  };
}

export interface ExamsPage {
  term: string;
  published: boolean;
  exams: { course: string; title: string; date: string; time: string; room: string }[];
}

/** Rows are read by column heading, since the grid only renders once exams are published. */
export function extractExams(doc: Document): ExamsPage {
  const exams: ExamsPage['exams'] = [];
  // PeopleSoft nests layout tables: find the row whose own cells are the headings.
  const headRow = Array.from(doc.querySelectorAll('tr'))
    .find(tr => cellsOf(tr).some(c => /^Exam Date/i.test(clean(c.textContent))));
  if (!headRow) landmark(doc, 'exams', ['DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$'], /exam schedule is not available/i);
  if (headRow) {
    const heads = cellsOf(headRow).map(c => clean(c.textContent));
    const col = (re: RegExp) => heads.findIndex(h => re.test(h));
    const idx = { course: col(/^Class/i), title: col(/Description/i), date: col(/Exam Date/i), time: col(/Time/i), room: col(/Location|Room/i) };
    for (let tr = headRow.nextElementSibling; tr; tr = tr.nextElementSibling) {
      const cells = cellsOf(tr).map(c => clean(c.textContent));
      const get = (k: keyof typeof idx) => (idx[k] >= 0 ? cells[idx[k]] ?? '' : '');
      if (get('date')) exams.push({ course: get('course'), title: get('title'), date: get('date'), time: get('time'), room: get('room') });
    }
  }
  return {
    term: text(doc, 'DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$').split('|')[0]!.trim(),
    published: !/exam schedule is not available/i.test(doc.body?.textContent ?? ''),
    exams,
  };
}
