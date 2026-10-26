import { describe, expect, it } from 'vitest';
import { demoHistory, demoResult } from '../../src/adapters/sources/demo/source';
import { CHANGES_KEEP_DAYS, diffSnapshots } from '../../src/core/derive';
import { SCHEMA_VERSION, type ExtraBlock, type SyncResult } from '../../src/core/model';
import { mergeExtras, mergeSnapshot, migrateSnapshot } from '../../src/core/snapshot';

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
  it('a failed area keeps its data and is marked stale', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { holds: [] },
      provenance: { notices: { status: 'fresh', fetchedAt: T2 }, attendance: { status: 'error', error: 'TIMEOUT' } },
    }, 'peoplesoft');
    expect(b.holds).toEqual([]); // fresh and empty means empty, for areas that can be
    expect(b.attendance).toEqual(a.attendance);
    expect(b.provenance.attendance).toEqual({ status: 'stale', fetchedAt: T1, error: 'TIMEOUT' });
  });

  it('doubts a schedule that comes back empty in the same term, and keeps the old one', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { sections: [], terms: [{ code: '2701', current: true }] },
      provenance: { schedule: { status: 'fresh', fetchedAt: T2 } },
    }, 'peoplesoft');
    expect(b.sections).toEqual(a.sections);
    expect(b.provenance.schedule).toEqual({ status: 'stale', fetchedAt: T1, error: 'PARSE' });
    // Nothing was "removed" in what's new.
    expect(b.changes.filter(c => c.at === T2)).toEqual([]);
  });

  it('believes an empty schedule in a new term', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { sections: [], terms: [{ code: '2702', current: true }] },
      provenance: { schedule: { status: 'fresh', fetchedAt: T2 } },
    }, 'peoplesoft');
    expect(b.sections).toEqual([]);
    expect(b.provenance.schedule).toEqual({ status: 'fresh', fetchedAt: T2 });
  });

  it('an area that never loaded stays in error, not stale', () => {
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
    // The earlier snapshot is untouched.
    expect(a.terms.map(t => t.current)).toEqual([true]);
  });

  it('starts over when the source changes', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, { fetchedAt: T2, data: {}, provenance: {} }, 'demo');
    expect(b.source).toBe('demo');
    expect(b.courses).toEqual([]);
  });

  it('archives a term when the source moves on to the next one', () => {
    const a = mergeSnapshot(undefined, first, 'peoplesoft');
    const b = mergeSnapshot(a, {
      fetchedAt: T2,
      data: { terms: [{ code: '2702', current: true }], sections: [], attendance: [] },
      provenance: { schedule: { status: 'fresh', fetchedAt: T2 }, attendance: { status: 'fresh', fetchedAt: T2 } },
    }, 'peoplesoft');
    expect(b.archive).toHaveLength(1);
    expect(b.archive[0]).toMatchObject({ term: { code: '2701', current: false }, archivedAt: T2 });
    expect(b.archive[0]!.sections).toHaveLength(1);
    expect(b.archive[0]!.attendance[0]?.absencePct).toBe(3);
    expect(b.archive[0]!.courses.map(c => c.key)).toEqual(['A 1']);
    // A new term is not "news" class by class.
    expect(b.changes).toEqual([]);
  });

  it('remembers what each sync changed', () => {
    const now = new Date(2026, 9, 22, 10, 15);
    let s = mergeSnapshot(undefined, demoHistory(now)[0]!, 'demo');
    expect(s.changes).toEqual([]);
    s = mergeSnapshot(s, demoResult(now), 'demo');
    expect(s.changes.map(c => c.kind).sort()).toEqual(['absence', 'exam-added', 'gpa', 'grade', 'room', 'todo-added']);
    expect(s.changes.find(c => c.kind === 'grade')).toMatchObject({ courseKey: 'PYAR 101', to: 'A' });
    expect(s.changes.find(c => c.kind === 'absence')).toMatchObject({ courseKey: 'PYBIO 101', from: 18.75, to: 21 });
    // Nothing new the second time; the earlier news stays.
    const again = mergeSnapshot(s, demoResult(now), 'demo');
    expect(again.changes).toEqual(s.changes);
  });

  it('forgets changes after two weeks', () => {
    const now = new Date(2026, 9, 22, 10, 15);
    const s = mergeSnapshot(mergeSnapshot(undefined, demoHistory(now)[0]!, 'demo'), demoResult(now), 'demo');
    const later = new Date(now.getTime() + (CHANGES_KEEP_DAYS + 1) * 86_400_000);
    const r = demoResult(now);
    const t = mergeSnapshot(s, { ...r, fetchedAt: later.toISOString() }, 'demo');
    expect(t.changes).toEqual([]);
  });

  it('a failed area changes nothing', () => {
    const now = new Date(2026, 9, 22, 10, 15);
    const s = mergeSnapshot(undefined, demoResult(now), 'demo');
    const r = demoResult(now);
    const failed = mergeSnapshot(s, { ...r, data: { ...r.data, grades: [] }, provenance: { ...r.provenance, grades: { status: 'error', error: 'TIMEOUT' } } }, 'demo');
    expect(diffSnapshots(s, failed, r.fetchedAt)).toEqual([]);
  });
});

describe('migrateSnapshot', () => {
  it('brings a version 1 snapshot up to date and refuses unknown ones', () => {
    const v1 = { ...mergeSnapshot(undefined, first, 'peoplesoft'), schemaVersion: 1, archive: undefined, changes: undefined };
    const m = migrateSnapshot(v1)!;
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.archive).toEqual([]);
    expect(m.changes).toEqual([]);
    expect(m.courses).toHaveLength(1);
    expect(migrateSnapshot({ schemaVersion: 99 })).toBeUndefined();
    expect(migrateSnapshot(undefined)).toBeUndefined();
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
