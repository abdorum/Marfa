// Fixtures mirror the element ids and markup observed on sis.bmc.edu.sa,
// with made-up student data.
import test from 'node:test';
import assert from 'node:assert';
import { DOMParser } from 'linkedom';
import * as P from '../public/parse.js';
import { isLoginPage, slim } from '../src/peoplesoft.js';

const toDoc = html => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
const wrap = fn => html => fn(toDoc(html));
const parseSchedule = wrap(P.parseSchedule);
const parseGrades = wrap(P.parseGrades);
const parseAttendance = wrap(P.parseAttendance);
const parseExams = wrap(P.parseExams);
const { toMinutes, parseDays } = P;

const center = `
<span id="DERIVED_SSS_SCL_TITLE1$78$">Ali's Student Center</span>
<table id="STDNT_WEEK_SCHD$scroll$0"><tr><td>
<span id="CLASS_NAME$span$0" class="PSHYPERLINKDISABLED">ICPY 100-PB1A<br>
LEC (3211)</span>
<span id="DERIVED_SSS_SCL_SSR_MTG_SCHED_LONG$0">MoTuWeThSu 4:00PM - 5:00PM<br>
Room&nbsp; TBA<br>
TuWeTh 6:00PM - 7:00PM<br>
Room&nbsp; B-204</span>
</td></tr><tr><td>
<span id="CLASS_NAME$span$1">PYBIO 101-BABL<br>
LAB (3458)</span>
<span id="DERIVED_SSS_SCL_SSR_MTG_SCHED_LONG$1">Mo 2:00PM - 3:00PM<br>
Room&nbsp; TBA</span>
</td></tr></table>`;

const grades = `
<span id="DERIVED_SSTSNAV_PERSON_NAME">ط¹ظ„ظٹ ط£ط­ظ…ط¯</span>
<span id="DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$">First Semester 2026-2027 | Batterjee Medical College</span>
<a id="CLS_LINK$0">ICPY 100</a><span id="CLASS_TBL_VW_DESCR$0">Intensive Course</span>
<span id="STDNT_ENRL_SSV1_UNT_TAKEN$0">&nbsp;</span><span id="STDNT_ENRL_SSV1_CRSE_GRADE_OFF$0">&nbsp;</span>
<span id="STDNT_ENRL_SSV1_GRADE_POINTS$0">&nbsp;</span>
<a id="CLS_LINK$1">PYAR 101</a><span id="CLASS_TBL_VW_DESCR$1">Arabic Language</span>
<span id="STDNT_ENRL_SSV1_UNT_TAKEN$1">1.00</span><span id="STDNT_ENRL_SSV1_CRSE_GRADE_OFF$1">A</span>
<span id="STDNT_ENRL_SSV1_GRADE_POINTS$1">4.000</span>
<span id="DERIVED_SSS_GRD_DESCR1$0"></span><span id="STATS_ENRL$0"></span>
<span id="DERIVED_SSS_GRD_DESCR1$1">Units Toward GPA:</span><span id="STATS_ENRL$1"></span>
<span id="DERIVED_SSS_GRD_DESCR1$2">Taken</span><span id="STATS_ENRL$2">1.000</span>
<span id="DERIVED_SSS_GRD_DESCR1$3">In Progress</span><span id="STATS_ENRL$3">13.000</span>
<span id="DERIVED_SSS_GRD_DESCR1$4">GPA</span><span id="STATS_ENRL$4">4.000</span>`;

const attendance = `
<span id="LS_SS_PERS_SRCH_NAME_DISPLAY">Ali Ahmed</span>
<span id="A_SF_ATT_DER_TERM_BEGIN_DT">09/06/2026</span><span id="A_SF_ATT_DER_END_DATE">10/15/2026</span>
<span id="A_SLF_ATT_PR_VW_STRM$0">2701</span><span id="A_SLF_ATT_PR_VW_SUBJECT$0">PYPHY</span>
<span id="A_SLF_ATT_PR_VW_CATALOG_NBR$0">101</span><span id="A_SLF_ATT_PR_VW_DESCR$0">General Physics</span>
<span id="A_SLF_ATT_PR_VW_PER_ORG_DESCRSHORT$0">0</span><span id="A_SLF_ATT_PR_VW_DESCR10$0">&nbsp;</span>
<span id="A_SLF_ATT_PR_VW_STRM$1">2701</span><span id="A_SLF_ATT_PR_VW_SUBJECT$1">PYMT</span>
<span id="A_SLF_ATT_PR_VW_CATALOG_NBR$1">101</span><span id="A_SLF_ATT_PR_VW_DESCR$1">Medical Terminology</span>
<span id="A_SLF_ATT_PR_VW_PER_ORG_DESCRSHORT$1">2.94</span><span id="A_SLF_ATT_PR_VW_DESCR10$1"></span>
<span id="A_SLF_ATT_YR_VW_SUBJECT$0">&nbsp;</span><span id="A_SLF_ATT_YR_VW_CATALOG_NBR$0"></span>`;

test('time and day helpers', () => {
  assert.strictEqual(toMinutes('4:00PM'), 960);
  assert.strictEqual(toMinutes('12:15AM'), 15);
  assert.strictEqual(toMinutes('12:30PM'), 750);
  assert.deepStrictEqual(parseDays('MoTuWeThSu'), [1, 2, 3, 4, 0]);
});

test('schedule', () => {
  const s = parseSchedule(center);
  assert.strictEqual(s.firstName, 'Ali');
  assert.strictEqual(s.classes.length, 2);
  const [a, b] = s.classes;
  assert.deepStrictEqual([a.course, a.section, a.component, a.classNbr], ['ICPY 100', 'PB1A', 'LEC', '3211']);
  assert.strictEqual(a.meetings.length, 2);
  assert.deepStrictEqual(a.meetings[1], { days: [2, 3, 4], start: 1080, end: 1140, room: 'B-204' });
  assert.strictEqual(a.meetings[0].room, 'TBA');
  assert.strictEqual(b.component, 'LAB');
});

test('grades', () => {
  const g = parseGrades(grades);
  assert.strictEqual(g.term, 'First Semester 2026-2027');
  assert.strictEqual(g.classes.length, 2);
  assert.deepStrictEqual(g.classes[1], { course: 'PYAR 101', title: 'Arabic Language', units: 1, grade: 'A', points: 4 });
  assert.strictEqual(g.classes[0].units, null);
  assert.strictEqual(g.stats['Units Toward GPA / In Progress'], '13.000');
  assert.strictEqual(g.gpa, '4.000');
});

test('attendance', () => {
  const a = parseAttendance(attendance);
  assert.strictEqual(a.name, 'Ali Ahmed');
  assert.strictEqual(a.semester.length, 2);
  assert.deepStrictEqual(a.semester[1], { term: '2701', course: 'PYMT 101', title: 'Medical Terminology', absence: 2.94, examStatus: '' });
  assert.strictEqual(a.yearly.length, 0);
});

test('student center side boxes', () => {
  const empty = parseSchedule(`${center}<div>Contact Information Primary Phone Home E-mail None
    <span id="DERIVED_SSS_SCL_EMAIL_ADDR">ali@example.com</span> Go Holds Description No Holds.
    To Do List Descr2 No To Do's. Advisor Program Advisor
    <span id="DERIVED_SSS_SCL_NAME_DISPLAY$span$0">None Assigned</span> Links</div>`).profile;
  assert.deepStrictEqual(empty, { email: 'ali@example.com', phone: '', advisor: '', holds: [], todos: [] });
  const full = parseSchedule(`${center}<div>Holds Description Library Fine details To Do List
    Descr2 Submit medical report Advisor Program Advisor
    <span id="DERIVED_SSS_SCL_NAME_DISPLAY$span$0">Dr. Sara</span></div>`).profile;
  assert.deepStrictEqual(full.holds, ['Library Fine']);
  assert.deepStrictEqual(full.todos, ['Submit medical report']);
  assert.strictEqual(full.advisor, 'Dr. Sara');
});

test('exam schedule', () => {
  const none = parseExams('<span id="DERIVED_REGFRM1_SSR_STDNTKEY_DESCR$11$">First Semester 2026-2027 | BMC</span>An exam schedule is not available for this term.');
  assert.deepStrictEqual(none, { term: 'First Semester 2026-2027', exams: [], published: false });
  const some = parseExams(`<table><tr><th>Class</th><th>Description</th><th>Exam Date</th><th>Exam Time</th><th>Location</th></tr>
    <tr><td>PYBIO 101</td><td>Human Biology</td><td>12/20/2026</td><td>9:00AM - 11:00AM</td><td>Hall A</td></tr></table>`);
  assert.deepStrictEqual(some.exams, [{ course: 'PYBIO 101', title: 'Human Biology', date: '12/20/2026', time: '9:00AM - 11:00AM', room: 'Hall A' }]);
});

test('parsePages survives slimming and reports parse failures', () => {
  const { data, errors } = P.parsePages(
    { attendance: slim(`<script>var x = "<span id='A_SLF_ATT_PR_VW_SUBJECT$9'>";</script>${attendance}`), grades: 'x', unknown: 'y' },
    html => (html === 'x' ? null : toDoc(html)));
  assert.strictEqual(data.attendance.semester.length, 2);
  assert.deepStrictEqual(errors, { grades: 'PARSE' });
  assert.ok(!('unknown' in data));
});

test('login page detection', () => {
  assert.ok(isLoginPage('<form action="/psp/hp/?cmd=login"><input name="pwd" type="password"></form>'));
  assert.ok(!isLoginPage('<a href="/psp/hp/EMPLOYEE/SA/?cmd=logout">Sign out</a>'));
});

