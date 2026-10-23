// The browser side of the PeopleSoft adapter: edge responses → canonical model.
import { describe, expect, it } from 'vitest';
import { createPeopleSoftSource } from '../../src/adapters/peoplesoft/client';
import type { SyncResponse } from '../../src/adapters/peoplesoft/pages';
import { RaadError } from '../../src/core/bot/types';
import { testCtx, toDoc } from '../helpers';
import { ATTENDANCE, CENTER, EXAMS_SOME, GRADES } from './samples';

const ok = (body: Partial<SyncResponse>) => new Response(JSON.stringify({ errors: {}, log: [], fetchedAt: '2026-10-22T10:00:00Z', ...body }), { status: 200 });

function source(respond: () => Response | Promise<Response>) {
  return createPeopleSoftSource({ fetch: async () => respond(), parseHtml: toDoc });
}

const run = (respond: () => Response | Promise<Response>) =>
  source(respond).sync({ ...testCtx(), credentials: { userid: '2000', pwd: 'x' } });

describe('PeopleSoft source', () => {
  it('maps all pages into one consistent snapshot', async () => {
    const r = await run(() => ok({ pages: { center: CENTER, grades: GRADES, attendance: ATTENDANCE, exams: EXAMS_SOME } }));
    expect(r.data.terms).toEqual([{ code: '2701', name: 'First Semester 2026-2027', start: '2026-09-06', end: '2026-10-15', current: true }]);
    expect(r.data.student).toMatchObject({
      id: '2000', name: { ar: 'علي أحمد', en: 'Ali Ahmed' }, firstName: { ar: 'علي', en: 'Ali' },
      program: 'FAST', email: 'ali@example.com', phone: undefined, advisor: undefined,
    });
    expect(r.data.sections?.[0]).toMatchObject({ courseKey: 'ICPY 100', termCode: '2701', section: 'PB1A', component: 'LEC', classNbr: '3211' });
    expect(r.data.courses?.find(c => c.key === 'ICPY 100')).toMatchObject({ subject: 'ICPY', catalog: '100', title: 'Intensive Course', lmsId: expect.stringMatching(/^2701-/) });
    expect(r.data.grades?.find(g => g.courseKey === 'PYAR 101')).toEqual({ courseKey: 'PYAR 101', termCode: '2701', grade: 'A', points: 4, units: 1 });
    expect(r.data.termStats?.[0]).toMatchObject({ gpa: 4, unitsTaken: 1, unitsInProgress: 13 });
    expect(r.data.attendance?.find(a => a.courseKey === 'PYMT 101')?.absencePct).toBe(2.94);
    expect(r.data.exams).toEqual([{ courseKey: 'PYBIO 101', termCode: '2701', date: '2026-12-20', start: 540, end: 660, room: 'Hall A' }]);
    expect(Object.values(r.provenance).every(p => p?.status === 'fresh')).toBe(true);
  });

  it('marks the sections of a failed page and keeps the rest', async () => {
    const r = await run(() => ok({ pages: { center: CENTER, grades: GRADES }, errors: { attendance: 'TIMEOUT', exams: 'NOT_AUTHORIZED' } }));
    expect(r.provenance.attendance).toEqual({ status: 'error', error: 'TIMEOUT' });
    expect(r.provenance.exams).toEqual({ status: 'error', error: 'SESSION' });
    expect(r.provenance.schedule?.status).toBe('fresh');
    expect(r.data.attendance).toBeUndefined();
  });

  it('turns edge failures into the right Raad failure kinds', async () => {
    const kind = (status: number, code?: string) => run(() => new Response(JSON.stringify({ code }), { status }))
      .then(() => 'none', (e: RaadError) => e.kind);
    expect(await kind(401, 'BAD_CREDENTIALS')).toBe('CREDENTIALS');
    expect(await kind(429)).toBe('RATE_LIMIT');
    expect(await kind(502, 'NOT_AUTHORIZED')).toBe('SESSION');
    expect(await kind(502, 'TIMEOUT')).toBe('TRANSIENT');
    expect(await kind(400, 'BAD_REQUEST')).toBe('UNEXPECTED');
    expect(await run(() => { throw new TypeError('offline'); }).catch((e: RaadError) => e.kind)).toBe('TRANSIENT');
  });

  it('a sync where every page failed with a dead session asks Raad for a new one', async () => {
    const e = await run(() => ok({ pages: {}, errors: { center: 'NOT_AUTHORIZED', grades: 'SESSION_EXPIRED' } })).catch(x => x);
    expect(e).toBeInstanceOf(RaadError);
    expect(e.kind).toBe('SESSION');
  });

  it('never sends credentials anywhere but the configured endpoint, and requires them', async () => {
    const seen: string[] = [];
    const src = createPeopleSoftSource({ endpoint: '/api/v1/sync', fetch: async (url) => { seen.push(String(url)); return ok({ pages: { center: CENTER } }); }, parseHtml: toDoc });
    await src.sync({ ...testCtx(), credentials: { userid: '1', pwd: 'p' } });
    expect(seen).toEqual(['/api/v1/sync']);
    await expect(src.sync(testCtx())).rejects.toMatchObject({ kind: 'CREDENTIALS' });
  });
});
