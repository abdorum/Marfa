// Turns PeopleSoft Classic pages into plain JSON, in the browser. PeopleSoft
// gives grid cells stable ids of the form FIELD$<row>, so each parser walks
// rows by id. Every parser takes a DOM Document.

const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index = JS getDay()

const clean = s => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const byId = (doc, id) => doc.getElementById(id);
const text = (doc, id) => clean(byId(doc, id)?.textContent);
const lines = (doc, id) => {
  const el = byId(doc, id);
  if (!el) return [];
  // Split the element's text at <br> tags.
  const out = [''];
  const walk = node => {
    for (const child of node.childNodes) {
      if (child.nodeName === 'BR') out.push('');
      else if (child.nodeType === 3) out[out.length - 1] += child.textContent;
      else walk(child);
    }
  };
  walk(el);
  return out.map(clean).filter(Boolean);
};
// Cells that belong to this row, not to tables nested inside it.
const cellsOf = tr => [...tr.children].filter(c => c.nodeName === 'TD' || c.nodeName === 'TH');
const rows = (doc, probeId) => {
  const out = [];
  for (let i = 0; byId(doc, probeId(i)); i++) out.push(i);
  return out;
};

export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}

export function parseDays(code) {
  const days = [];
  for (let i = 0; i < code.length; i += 2) {
    const idx = DAY_CODES.indexOf(code.slice(i, i + 2));
    if (idx >= 0) days.push(idx);
  }
  return days;
}

// Student Center → "This Week's Schedule" grid and side boxes.
export function parseSchedule(doc) {
  const classes = rows(doc, i => `CLASS_NAME$span$${i}`).map(i => {
    const [nameLine = '', compLine = ''] = lines(doc, `CLASS_NAME$span$${i}`);
    const [course = nameLine, section = ''] = nameLine.split('-');
    const comp = /^(\w+)\s*\((\d+)\)/.exec(compLine) || [];
    const meetings = [];
    let current = null;
    for (const line of lines(doc, `DERIVED_SSS_SCL_SSR_MTG_SCHED_LONG$${i}`)) {
      const m = /^([A-Za-z]+)\s+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(line);
      if (m) {
        current = { days: parseDays(m[1]), start: toMinutes(m[2]), end: toMinutes(m[3]), room: '' };
        meetings.push(current);
      } else if (current && /^Room/i.test(line)) {
        current.room = line.replace(/^Room\s*/i, '').trim();
      }
    }
    return { course: course.trim(), section: section.trim(), component: comp[1] || compLine, classNbr: comp[2] || '', meetings };
  });
  return {
    classes,
    firstName: text(doc, 'DERIVED_SSS_SCL_TITLE1$78$').replace(/'s Student Center$/, ''),
    profile: parseCenterProfile(doc),
  };
}

// The Student Center side boxes have no stable row ids when empty, so they
// are read from the page text between their headings.
function parseCenterProfile(doc) {
  const body = clean(doc.body?.textContent);
  const between = (from, to) => {
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
    email,
    phone: between('Home E-mail', email || 'Go').replace(/^None\b/, '').trim(),
    advisor: advisor && advisor !== 'None Assigned' ? advisor : '',
    holds: holds && !/^No Holds/i.test(holds) ? [holds.replace(/\s*details\s*$/i, '')] : [],
    todos: todos && !/^No To Do/i.test(todos) ? [todos] : [],
  };
}

// "View My Grades" for the term PeopleSoft opens by default.
export function parseGrades(doc) {
  const classes = rows(doc, i => `CLS_LINK$${i}`).map(i => ({
    course: text(doc, `CLS_LINK$${i}`),
    title: text(doc, `CLASS_TBL_VW_DESCR$${i}`),
    units: parseFloat(text(doc, `STDNT_ENRL_SSV1_UNT_TAKEN$${i}`)) || null,
    grade: text(doc, `STDNT_ENRL_SSV1_CRSE_GRADE_OFF$${i}`),
    points: parseFloat(text(doc, `STDNT_ENRL_SSV1_GRADE_POINTS$${i}`)) || null,
  }));
  const stats = {};
  let group = '';
  rows(doc, i => `STATS_ENRL$${i}`).forEach(i => {
    const label = text(doc, `DERIVED_SSS_GRD_DESCR1$${i}`).replace(/:$/, '');
    const value = text(doc, `STATS_ENRL$${i}`);
    if (label && !value && /Units|GPA/i.test(label) && label !== 'GPA') { group = label; return; }
    if (label && value) stats[group ? `${group} / ${label}` : label] = value;
  });
  const gpaKey = Object.keys(stats).find(k => /(^|\/ )GPA$/.test(k));
  return {
    term: text(doc, 'DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$').split('|')[0].trim(),
    name: text(doc, 'DERIVED_SSTSNAV_PERSON_NAME'),
    classes,
    stats,
    gpa: gpaKey ? stats[gpaKey] : '',
  };
}

// Custom BMC "Self Service Attendance" page.
export function parseAttendance(doc) {
  const grid = prefix => rows(doc, i => `${prefix}_SUBJECT$${i}`)
    .map(i => ({
      term: text(doc, `${prefix}_STRM$${i}`),
      course: `${text(doc, `${prefix}_SUBJECT$${i}`)} ${text(doc, `${prefix}_CATALOG_NBR$${i}`)}`.trim(),
      title: text(doc, `${prefix}_DESCR$${i}`),
      absence: parseFloat(text(doc, `${prefix}_PER_ORG_DESCRSHORT$${i}`)) || 0,
      examStatus: text(doc, `${prefix}_DESCR10$${i}`),
    }))
    .filter(r => r.course);
  return {
    name: text(doc, 'LS_SS_PERS_SRCH_NAME_DISPLAY'),
    from: text(doc, 'A_SF_ATT_DER_TERM_BEGIN_DT'),
    to: text(doc, 'A_SF_ATT_DER_END_DATE'),
    semester: grid('A_SLF_ATT_PR_VW'),
    yearly: grid('A_SLF_ATT_YR_VW'),
  };
}

// "My Exam Schedule" list view. Rows are read by column heading, since the
// grid only renders once exams are published.
export function parseExams(doc) {
  const term = text(doc, 'DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$').split('|')[0].trim();
  const exams = [];
  // PeopleSoft nests layout tables, so look for the row whose own cells are
  // the column headings.
  const headRow = [...doc.querySelectorAll('tr')]
    .find(tr => cellsOf(tr).some(c => /^Exam Date/i.test(clean(c.textContent))));
  if (headRow) {
    const heads = cellsOf(headRow).map(c => clean(c.textContent));
    const col = re => heads.findIndex(h => re.test(h));
    const idx = { course: col(/^Class/i), title: col(/Description/i), date: col(/Exam Date/i), time: col(/Time/i), room: col(/Location|Room/i) };
    for (let tr = headRow.nextElementSibling; tr; tr = tr.nextElementSibling) {
      const cells = cellsOf(tr).map(c => clean(c.textContent));
      const get = k => (idx[k] >= 0 ? cells[idx[k]] || '' : '');
      if (get('date')) exams.push({ course: get('course'), title: get('title'), date: get('date'), time: get('time'), room: get('room') });
    }
  }
  return { term, exams, published: !/exam schedule is not available/i.test(doc.body?.textContent || '') };
}

const PARSERS = { center: parseSchedule, grades: parseGrades, attendance: parseAttendance, exams: parseExams };

// Raw pages from /api/refresh → the data the app renders. A page that fails to
// parse is reported like a page that failed to load.
export function parsePages(pages, makeDoc = html => new DOMParser().parseFromString(html, 'text/html')) {
  const out = {};
  const errors = {};
  for (const [key, html] of Object.entries(pages || {})) {
    if (!PARSERS[key]) continue;
    try { out[key] = PARSERS[key](makeDoc(html)); } catch { errors[key] = 'PARSE'; }
  }
  return { data: out, errors };
}
