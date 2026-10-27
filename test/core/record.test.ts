// «مساحتي»: the record's numbers come from the snapshot alone, and a badge is
// earned only when the data shows it.
import { describe, expect, it } from 'vitest';
import { demoResult } from '../../src/adapters/sources/demo/source';
import { record } from '../../src/core/derive';
import type { Snapshot, TermRecord } from '../../src/core/model';
import { mergeSnapshot } from '../../src/core/snapshot';

const NOW = new Date(2026, 9, 22, 10, 15);
const snap = mergeSnapshot(undefined, demoResult(NOW), 'demo');

describe('the record', () => {
  it('reads attendance, the worst course and hours from this term', () => {
    const r = record(snap, 25);
    const now = snap.attendance.filter(a => a.scope === 'semester');
    expect(r.attendance).toBeCloseTo(100 - now.reduce((n, a) => n + a.absencePct, 0) / now.length);
    expect(r.worst?.absencePct).toBe(Math.max(...now.map(a => a.absencePct)));
    expect(r.unitsInProgress).toBe(13);
    expect(r.cumulativeGpa).toBeUndefined();
  });

  it('takes the cumulative average only from the college page, and the term before from the archive', () => {
    const term = snap.terms[0]!.code;
    const past: TermRecord = {
      term: { code: '0001', name: 'Before', current: false }, courses: [], sections: [], attendance: [], exams: [], archivedAt: '2026-06-01',
      grades: [{ courseKey: 'PYAR 101', termCode: '0001', grade: 'A', points: 4, units: 2 }],
      termStats: [{ termCode: '0001', gpa: 3.2, unitsPassed: 30, raw: { 'Cumulative / GPA': '3.41' } }],
    };
    const s: Snapshot = { ...snap, archive: [past], termStats: [{ termCode: term, gpa: 3.8, unitsInProgress: 13, raw: {} }] };
    const r = record(s, 25);
    expect(r).toMatchObject({ gpa: 3.8, previousGpa: 3.2, cumulativeGpa: 3.41, unitsPassed: 30 });
    expect([...r.earned].sort()).toEqual(expect.arrayContaining(['firstGrade', 'gpa35', 'termDone', 'units30']));
  });

  it('earns nothing it cannot show', () => {
    const empty: Snapshot = { ...snap, attendance: [], grades: [], termStats: [], archive: [] };
    const r = record(empty, 25);
    expect(r.attendance).toBeUndefined();
    expect(r.gpa).toBeUndefined();
    expect(r.earned.size).toBe(0);
  });

  it('keeps far from the limit only while every course is under half of it', () => {
    const term = snap.terms[0]!.code;
    const at = (pcts: number[]): Snapshot => ({ ...snap, attendance: pcts.map((p, i) => ({ courseKey: `C ${i}`, termCode: term, scope: 'semester', absencePct: p })) });
    expect(record(at([0, 5, 12]), 25).earned.has('farFromLimit')).toBe(true);
    expect(record(at([0, 5, 13]), 25).earned.has('farFromLimit')).toBe(false);
    expect(record(at([0, 5, 13]), 25).earned.has('cleanCourse')).toBe(true);
    expect(record(at([2, 5]), 25).earned.has('cleanCourse')).toBe(false);
  });
});
