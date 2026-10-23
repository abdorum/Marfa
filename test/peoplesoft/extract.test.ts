// Extractors on synthetic pages; real (anonymized) pages are in fixtures.test.ts.
import { describe, expect, it } from 'vitest';
import { parseDays, toMinutes, usDateToIso } from '../../src/adapters/peoplesoft/extract/dom';
import { extractAttendance, extractCenter, extractExams, extractGrades } from '../../src/adapters/peoplesoft/extract/pages';
import { toDoc } from '../helpers';
import { ATTENDANCE, CENTER, EXAMS_NONE, EXAMS_SOME, GRADES } from './samples';

describe('dom helpers', () => {
  it('parses times, days and dates', () => {
    expect(toMinutes('4:00PM')).toBe(960);
    expect(toMinutes('12:15AM')).toBe(15);
    expect(toMinutes('12:30PM')).toBe(750);
    expect(parseDays('MoTuWeThSu')).toEqual([1, 2, 3, 4, 0]);
    expect(usDateToIso('9/6/2026')).toBe('2026-09-06');
  });
});

describe('extractors', () => {
  it('reads the Student Center schedule and side boxes', () => {
    const c = extractCenter(toDoc(CENTER));
    expect(c.firstName).toBe('علي');
    expect(c.classes).toHaveLength(2);
    const [a, b] = c.classes;
    expect([a!.course, a!.section, a!.component, a!.classNbr]).toEqual(['ICPY 100', 'PB1A', 'LEC', '3211']);
    expect(a!.lmsId).toBe('2701-ELLEC-ASR-FAST-1-LEC-ICPY100-3211-FST-S1');
    expect(a!.meetings).toEqual([
      { days: [1, 2, 3, 4, 0], start: 960, end: 1020, room: undefined },
      { days: [2, 3, 4], start: 1080, end: 1140, room: 'B-204' },
    ]);
    expect(b!.component).toBe('LAB');
    expect(c).toMatchObject({ email: 'ali@example.com', phone: '', advisor: '', holds: [], todos: [] });
  });

  it('reads holds, to-dos and an advisor when present', () => {
    const c = extractCenter(toDoc(`<div>Holds Description Library Fine details To Do List
      Descr2 Submit medical report Advisor Program Advisor
      <span id="DERIVED_SSS_SCL_NAME_DISPLAY$span$0">Dr. Sara</span></div>`));
    expect(c).toMatchObject({ holds: ['Library Fine'], todos: ['Submit medical report'], advisor: 'Dr. Sara' });
  });

  it('reads grades and term statistics', () => {
    const g = extractGrades(toDoc(GRADES));
    expect(g.term).toBe('First Semester 2026-2027');
    expect(g.nameAr).toBe('علي أحمد');
    expect(g.classes[1]).toEqual({ course: 'PYAR 101', title: 'Arabic Language', units: 1, grade: 'A', points: 4 });
    expect(g.classes[0]!.units).toBeUndefined();
    expect(g.stats).toEqual({ 'Units Toward GPA / Taken': '1.000', 'Units Toward GPA / In Progress': '13.000', 'Units Toward GPA / GPA': '4.000' });
  });

  it('reads attendance and skips empty rows', () => {
    const a = extractAttendance(toDoc(ATTENDANCE));
    expect(a).toMatchObject({ nameEn: 'Ali Ahmed', from: '2026-09-06', to: '2026-10-15' });
    expect(a.rows).toHaveLength(2);
    expect(a.rows[1]).toEqual({ scope: 'semester', program: 'FAST', term: '2701', course: 'PYMT 101', title: 'Medical Terminology', absencePct: 2.94, examStatus: '' });
  });

  it('reads exams by column heading, through nested tables', () => {
    expect(extractExams(toDoc(EXAMS_NONE))).toEqual({ term: 'First Semester 2026-2027', published: false, exams: [] });
    expect(extractExams(toDoc(EXAMS_SOME)).exams).toEqual([{ course: 'PYBIO 101', title: 'Human Biology', date: '12/20/2026', time: '9:00AM - 11:00AM', room: 'Hall A' }]);
  });
});
