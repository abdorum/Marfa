// Real PeopleSoft pages, anonymized by the dev capture tool (open the app at
// /?capture in `npm run dev` and sign in). If PeopleSoft changes a page, these
// tests are the first to fail. Skipped until fixtures are captured.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractAttendance, extractCenter, extractExams, extractGrades } from '../../src/adapters/sources/peoplesoft/extract/pages';
import { mapToSnapshot } from '../../src/adapters/sources/peoplesoft/map';
import { clashes } from '../../src/core/derive';
import { mergeSnapshot } from '../../src/core/snapshot';
import { toDoc } from '../helpers';

const dir = new URL('../fixtures/peoplesoft/', import.meta.url);
const load = (name: string) => {
  const file = new URL(`${name}.html`, dir);
  return existsSync(file) ? toDoc(readFileSync(file, 'utf8')) : undefined;
};

const center = load('center');
const grades = load('grades');
const attendance = load('attendance');
const exams = load('exams');

describe.skipIf(!center)('fixture: Student Center', () => {
  const c = center ? extractCenter(center) : (undefined as never);
  it('has classes with meetings', () => {
    expect(c.classes.length).toBeGreaterThan(0);
    for (const k of c.classes) {
      expect(k.course).toMatch(/^[A-Z]+ \d+[A-Z]?$/);
      expect(k.component).toMatch(/^[A-Z]{3}$/);
      expect(k.meetings.length).toBeGreaterThan(0);
    }
  });
  it('is anonymized', () => {
    expect(c.firstName).toMatch(/^(أحمد|Ahmed)$/);
    if (c.email) expect(c.email).toBe('student@example.com');
  });
  it('extracts the same as last time', () => expect(c).toMatchSnapshot());
});

describe.skipIf(!grades)('fixture: grades', () => {
  const g = grades ? extractGrades(grades) : (undefined as never);
  it('has a term and classes', () => {
    expect(g.term).toMatch(/Semester|Term/i);
    expect(g.classes.length).toBeGreaterThan(0);
    expect(g.nameAr).toContain('أحمد');
  });
  it('extracts the same as last time', () => expect(g).toMatchSnapshot());
});

describe.skipIf(!attendance)('fixture: attendance', () => {
  const a = attendance ? extractAttendance(attendance) : (undefined as never);
  it('has rows and a period', () => {
    expect(a.rows.length).toBeGreaterThan(0);
    expect(a.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.nameEn).toContain('Ahmed');
  });
  it('extracts the same as last time', () => expect(a).toMatchSnapshot());
});

describe.skipIf(!exams)('fixture: exams', () => {
  it('extracts the same as last time', () => expect(extractExams(exams!)).toMatchSnapshot());
});

describe.skipIf(!(center && grades && attendance))('fixture: all pages together', () => {
  it('map into one consistent term', () => {
    const r = mapToSnapshot({ center: extractCenter(center!), grades: extractGrades(grades!), attendance: extractAttendance(attendance!) }, {}, '20000000', '2026-01-01T00:00:00Z', 'BMC');
    const term = r.data.terms?.[0]?.code;
    expect(term).toMatch(/^\d{4}$/);
    for (const s of r.data.sections ?? []) expect(s.termCode).toBe(term);
    const keys = new Set(r.data.courses?.map(c => c.key));
    for (const s of r.data.sections ?? []) expect(keys.has(s.courseKey)).toBe(true);
    // Every class on the Student Center is kept: eight classes, seven courses (Human Biology has a lab).
    expect(r.data.sections).toHaveLength(8);
    expect(keys.size).toBe(7);
  });

  it('show the clashes in the real schedule', () => {
    const r = mapToSnapshot({ center: extractCenter(center!) }, {}, '20000000', '2026-01-01T00:00:00Z', 'BMC');
    const s = mergeSnapshot(undefined, r, 'peoplesoft');
    const found = clashes(s).map(c => (c.kind === 'class' ? `${c.day}:${c.a.courseKey}+${c.b.courseKey}` : ''));
    // The intensive course shares slots with Human Biology and Physics.
    expect(found).toContain('1:ICPY 100+PYBIO 101');
    expect(found).toContain('1:ICPY 100+PYPHY 101');
  });
});
