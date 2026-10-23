// The same checks for every data source. A new source (e.g. the official API)
// is safe to switch to once it passes this file.
import { describe, expect, it } from 'vitest';
import { createDemoSource } from '../../src/adapters/demo/source';
import { createOfficialSource } from '../../src/adapters/official/source';
import { createPeopleSoftSource } from '../../src/adapters/peoplesoft/client';
import type { StudentDataSource } from '../../src/adapters/ports';
import { SECTION_KEYS, type SyncResult } from '../../src/core/model';
import { mergeSnapshot } from '../../src/core/snapshot';
import { ATTENDANCE, CENTER, EXAMS_SOME, GRADES } from '../peoplesoft/samples';
import { testCtx, toDoc } from '../helpers';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A fake of the API in Docs/11-integration-contract.md. */
const OFFICIAL_API: Record<string, unknown> = {
  '/v1/me': { id: '2000', name: { ar: 'علي أحمد', en: 'Ali Ahmed' }, program: 'FAST', email: 'ali@example.com' },
  '/v1/terms': [{ code: '2701', name: 'First Semester 2026-2027', start: '2026-09-06', end: '2027-01-15', current: true }],
  '/v1/terms/2701/enrollments': { items: [{ course: 'PYBIO 101', title: 'Human Biology', units: 4, section: 'PBAB', component: 'LEC', classNbr: '3456', meetings: [{ days: [0, 2], start: '08:00', end: '09:30', room: 'B-104' }] }] },
  '/v1/terms/2701/attendance': { items: [{ course: 'PYBIO 101', title: 'Human Biology', absencePct: 6.25, examStatus: null }] },
  '/v1/terms/2701/grades': { items: [{ course: 'PYBIO 101', grade: null, points: null, units: 4 }], unitsInProgress: 4 },
  '/v1/terms/2701/exams': { items: [{ course: 'PYBIO 101', date: '2026-12-20', start: '09:00', end: '11:00', room: 'Hall 1' }] },
  '/v1/notices': { holds: [], todos: [] },
};

const sources: [string, () => StudentDataSource][] = [
  ['official', () => createOfficialSource({
    baseUrl: 'https://api.example.edu',
    getToken: async () => 'token',
    fetch: async (url, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token');
      const body = OFFICIAL_API[new URL(String(url)).pathname];
      return body ? new Response(JSON.stringify(body)) : new Response('{}', { status: 404 });
    },
  })],
  ['demo', () => createDemoSource(() => new Date(2026, 9, 22, 10))],
  ['peoplesoft', () => createPeopleSoftSource({
    parseHtml: toDoc,
    fetch: async () => new Response(JSON.stringify({
      pages: { center: CENTER, grades: GRADES, attendance: ATTENDANCE, exams: EXAMS_SOME }, errors: {}, log: [], fetchedAt: '2026-10-22T10:00:00Z',
    })),
  })],
];

describe.each(sources)('%s source contract', (_name, make) => {
  let result: SyncResult;
  const get = async () => (result ??= await make().sync({ ...testCtx(), credentials: { userid: '2000', pwd: 'x' } }));

  it('reports provenance only for known sections', async () => {
    const r = await get();
    for (const key of Object.keys(r.provenance)) expect(SECTION_KEYS).toContain(key);
    expect(r.provenance.schedule?.status).toBe('fresh');
  });

  it('has a student and exactly one current term', async () => {
    const r = await get();
    expect(r.data.student?.id).toBeTruthy();
    expect(r.data.student?.institution).toBeTruthy();
    expect(r.data.terms?.filter(t => t.current)).toHaveLength(1);
    for (const t of r.data.terms ?? []) for (const d of [t.start, t.end]) if (d) expect(d).toMatch(ISO_DATE);
  });

  it('references only courses it also describes', async () => {
    const r = await get();
    const keys = new Set(r.data.courses?.map(c => c.key));
    for (const list of [r.data.sections, r.data.attendance, r.data.grades, r.data.exams]) {
      for (const x of list ?? []) expect(keys.has(x.courseKey)).toBe(true);
    }
    for (const c of r.data.courses ?? []) expect(c.key).toBe(`${c.subject} ${c.catalog}`.trim());
  });

  it('has sane meetings, percentages and dates', async () => {
    const r = await get();
    for (const s of r.data.sections ?? []) for (const m of s.meetings) {
      expect(m.start).toBeGreaterThanOrEqual(0);
      expect(m.end).toBeGreaterThan(m.start);
      expect(m.end).toBeLessThanOrEqual(24 * 60);
      for (const d of m.days) expect(d >= 0 && d <= 6).toBe(true);
    }
    for (const a of r.data.attendance ?? []) expect(a.absencePct >= 0 && a.absencePct <= 100).toBe(true);
    for (const e of r.data.exams ?? []) expect(e.date).toMatch(ISO_DATE);
  });

  it('merges into a snapshot', async () => {
    const s = mergeSnapshot(undefined, await get(), make().id);
    expect(s.sections.length).toBeGreaterThan(0);
    expect(s.courses.length).toBeGreaterThan(0);
  });
});
