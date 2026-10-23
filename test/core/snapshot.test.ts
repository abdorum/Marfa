import { describe, expect, it } from 'vitest';
import type { ExtraBlock, SyncResult } from '../../src/core/model';
import { mergeExtras, mergeSnapshot } from '../../src/core/snapshot';

const T1 = '2026-10-22T10:00:00.000Z';
const T2 = '2026-10-22T11:00:00.000Z';

const first: SyncResult = {
  fetchedAt: T1,
  data: {
    student: { id: '1', name: { ar: 'علي', en: 'Ali' }, firstName: { ar: 'علي' }, institution: 'BMC' },
    courses: [{ key: 'A 1', subject: 'A', catalog: '1', title: 'Alpha' }],
    terms: [{ code: '2701', current: true, start: '2026-09-06' }],
    sections: [{ courseKey: 'A 1', termCode: '2701', section: 'X', component: 'LEC', meetings: [] }],
    attendance: [{ courseKey: 'A 1', termCode: '2701', scope: 'semester', absencePct: 3 }],
  },
  provenance: { student: { status: 'fresh', fetchedAt: T1 }, schedule: { status: 'fresh', fetchedAt: T1 }, attendance: { status: 'fresh', fetchedAt: T1 } },
};

describe('mergeSnapshot', () => {
  it('a failed section keeps its data and is marked stale', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { sections: [] },
      provenance: { schedule: { status: 'fresh', fetchedAt: T2 }, attendance: { status: 'error', error: 'TIMEOUT' } },
    }, 'peoplesoft');
    expect(b.sections).toEqual([]); // fresh and empty means empty
    expect(b.attendance).toEqual(a.attendance);
    expect(b.provenance.attendance).toEqual({ status: 'stale', fetchedAt: T1, error: 'TIMEOUT' });
  });

  it('a section that never loaded stays in error, not stale', () => {
    const a = mergeSnapshot(undefined, { fetchedAt: T1, data: {}, provenance: { exams: { status: 'error', error: 'SESSION' } } }, 'peoplesoft');
    expect(a.provenance.exams).toEqual({ status: 'error', error: 'SESSION' });
    expect(a.exams).toEqual([]);
  });

  it('merges the student field by field so one page cannot erase another', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { student: { id: '1', name: { ar: undefined, en: 'Ali Ahmed' }, firstName: {}, institution: 'BMC', email: 'a@b.c' } },
      provenance: { student: { status: 'fresh', fetchedAt: T2 } },
    }, 'peoplesoft');
    expect(b.student).toMatchObject({ name: { ar: 'علي', en: 'Ali Ahmed' }, firstName: { ar: 'علي' }, email: 'a@b.c' });
  });

  it('upserts courses and terms without losing known values', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { courses: [{ key: 'A 1', subject: 'A', catalog: '1', units: 3 }], terms: [{ code: '2702', current: true }] },
      provenance: {},
    }, 'peoplesoft');
    expect(b.courses).toEqual([{ key: 'A 1', subject: 'A', catalog: '1', title: 'Alpha', units: 3 }]);
    expect(b.terms.map(t => [t.code, t.current])).toEqual([['2701', false], ['2702', true]]);
  });

  it('starts over when the source changes', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, { fetchedAt: T2, data: {}, provenance: {} }, 'demo');
    expect(b.source).toBe('demo');
    expect(b.courses).toEqual([]);
  });
});

describe('mergeExtras', () => {
  const block = (id: string, at = T1): ExtraBlock => ({ id, title: id, kind: 'table', firstSeen: at, lastSeen: at });

  it('keeps firstSeen, drops a block after two syncs without it', () => {
    const one = mergeExtras([], [block('a'), block('b')], T1);
    const two = mergeExtras(one, [block('a', T2)], T2);
    expect(two.find(b => b.id === 'a')).toMatchObject({ firstSeen: T1, lastSeen: T2, missed: 0 });
    expect(two.find(b => b.id === 'b')?.missed).toBe(1);
    const three = mergeExtras(two, [block('a', T2)], T2);
    expect(three.map(b => b.id)).toEqual(['a']);
  });
});
