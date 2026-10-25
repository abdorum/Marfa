// Conformance tests (Docs/20-adapters.md; ADR-022): the same checks for every
// adapter. A new adapter is accepted once it passes this file; add it to
// ADAPTERS below with a fake of its source.
import { describe, expect, it } from 'vitest';
import { MANIFESTS } from '../../src/adapters/sources';
import { createDemoSource } from '../../src/adapters/sources/demo/source';
import { createOfficialSource } from '../../src/adapters/sources/official/source';
import { createPeopleSoftSource } from '../../src/adapters/sources/peoplesoft/client';
import { DATA_AREAS, type SyncResult } from '../../src/core/model';
import { mergeSnapshot } from '../../src/core/snapshot';
import type { StudentDataSource } from '../../src/ports/source';
import { testCtx, toDoc } from '../helpers';
import { ATTENDANCE, CENTER, EXAMS_SOME, GRADES } from '../peoplesoft/samples';

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

const ADAPTERS: [string, () => StudentDataSource][] = [
  ['official', () => createOfficialSource({
    baseUrl: 'https://api.example.edu',
    institution: 'Example University',
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
    institution: 'Batterjee Medical College',
    fetch: async () => new Response(JSON.stringify({
      pages: { center: CENTER, grades: GRADES, attendance: ATTENDANCE, exams: EXAMS_SOME }, errors: {}, log: [], fetchedAt: '2026-10-22T10:00:00Z',
    })),
  })],
];

describe('the adapters this build carries', () => {
  it('each has exactly one manifest, and a conformance run below', () => {
    const ids = MANIFESTS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(ADAPTERS.map(([id]) => id).sort());
  });
});

describe.each(ADAPTERS)('%s adapter', (_name, make) => {
  let result: SyncResult;
  const ctx = testCtx();
  const get = async () => (result ??= await make().sync({ ...ctx, credentials: { userid: '2000', pwd: 'x' } }));

  it('declares itself: tier, what it provides, what it needs, read only', () => {
    const m = make().manifest;
    expect(['A', 'B', 'C', 'D']).toContain(m.tier);
    expect(m.readOnly).toBe(true);
    expect(m.provides.length).toBeGreaterThan(0);
    for (const a of m.provides) expect(DATA_AREAS).toContain(a);
    expect(['none', 'token', 'password']).toContain(m.credentials);
    // Only tier D may ask for a password (Docs/20).
    if (m.credentials === 'password') expect(m.tier).toBe('D');
    expect(m.maintainer).toBeTruthy();
  });

  it('reports provenance only for the areas it declares', async () => {
    const r = await get();
    const provides = make().manifest.provides as readonly string[];
    for (const key of Object.keys(r.provenance)) expect(provides).toContain(key);
    expect(r.provenance.schedule?.status).toBe('fresh');
  });

  it('tells the student what it is doing', async () => {
    await get();
    expect(ctx.steps.length).toBeGreaterThan(0);
    // Steps carry no personal data: notes are codes and part names only.
    for (const e of ctx.events) if (e.note) expect(e.note).toMatch(/^[a-z]+(:[A-Z_]+)?$|^[A-Z_]+$/);
  });

  it('has a student and exactly one current term', async () => {
    const r = await get();
    expect(r.data.student?.id).toBeTruthy();
    expect(r.data.student?.institution).toBeTruthy();
    expect(r.data.terms?.filter(t => t.current)).toHaveLength(1);
    for (const t of r.data.terms ?? []) for (const d of [t.start, t.end]) if (d) expect(d).toMatch(ISO_DATE);
  });

  it('references only courses it also describes, by their whole code', async () => {
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
    const s = mergeSnapshot(undefined, await get(), make().manifest.id);
    expect(s.sections.length).toBeGreaterThan(0);
    expect(s.courses.length).toBeGreaterThan(0);
  });
});
