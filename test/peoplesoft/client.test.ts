// The browser side of the PeopleSoft adapter: Raad's responses → canonical model.
import { describe, expect, it } from 'vitest';
import { createPeopleSoftSource } from '../../src/adapters/sources/peoplesoft/client';
import type { SyncResponse } from '../../src/adapters/sources/peoplesoft/pages';
import { RaadError } from '../../raad/engine/types';
import { testCtx, toDoc } from '../helpers';
import { ATTENDANCE, CENTER, EXAMS_SOME, GRADES } from './samples';

const ok = (body: Partial<SyncResponse>) => new Response(JSON.stringify({ errors: {}, log: [], fetchedAt: '2026-10-22T10:00:00Z', ...body }), { status: 200 });

function source(respond: () => Response | Promise<Response>) {
  return createPeopleSoftSource({ fetch: async () => respond(), parseHtml: toDoc, institution: 'Batterjee Medical College' });
}

const run = (respond: () => Response | Promise<Response>, ctx = testCtx()) =>
  source(respond).sync({ ...ctx, credentials: { userid: '2000', pwd: 'x' } });

/** A streamed response, cut into uneven chunks like a real network. */
const streamed = (lines: unknown[]) => {
  const text = lines.map(l => `${JSON.stringify(l)}\n`).join('');
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(c) { for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37)); c.close(); },
  }), { headers: { 'Content-Type': 'application/x-ndjson' } });
};

describe('PeopleSoft source', () => {
  it('maps all pages into one consistent snapshot', async () => {
    const r = await run(() => ok({ pages: { center: CENTER, grades: GRADES, attendance: ATTENDANCE, exams: EXAMS_SOME } }));
    // The attendance page's "End Date" is not the term's end, so the end stays unknown.
    expect(r.data.terms).toEqual([{ code: '2701', name: 'First Semester 2026-2027', start: '2026-09-06', current: true }]);
    expect(r.data.student).toMatchObject({
      id: '2000', name: { ar: 'علي أحمد', en: 'Ali Ahmed' }, firstName: { ar: 'علي', en: 'Ali' },
      program: 'FAST', email: 'ali@example.com', phone: undefined, advisor: undefined, institution: 'Batterjee Medical College',
    });
    expect(r.data.sections?.[0]).toMatchObject({ courseKey: 'ICPY 100', termCode: '2701', section: 'PB1A', component: 'LEC', classNbr: '3211' });
    expect(r.data.courses?.find(c => c.key === 'ICPY 100')).toMatchObject({ subject: 'ICPY', catalog: '100', title: 'Intensive Course', lmsId: expect.stringMatching(/^2701-/) });
    expect(r.data.grades?.find(g => g.courseKey === 'PYAR 101')).toEqual({ courseKey: 'PYAR 101', termCode: '2701', grade: 'A', points: 4, units: 1 });
    expect(r.data.termStats?.[0]).toMatchObject({ gpa: 4, unitsTaken: 1, unitsInProgress: 13 });
    expect(r.data.attendance?.find(a => a.courseKey === 'PYMT 101')?.absencePct).toBe(2.94);
    expect(r.data.exams).toEqual([{ courseKey: 'PYBIO 101', termCode: '2701', date: '2026-12-20', start: 540, end: 660, room: 'Hall A' }]);
    expect(Object.values(r.provenance).every(p => p?.status === 'fresh')).toBe(true);
  });

  it('a lecture and its lab stay one course with two components', async () => {
    const r = await run(() => ok({ pages: { center: CENTER, grades: GRADES, attendance: ATTENDANCE } }));
    expect(r.data.courses?.map(c => c.key).sort()).toEqual(['ICPY 100', 'PYAR 101', 'PYBIO 101', 'PYMT 101', 'PYPHY 101']);
    expect(r.data.sections?.map(x => `${x.courseKey}:${x.component}`)).toEqual(['ICPY 100:LEC', 'PYBIO 101:LAB']);
  });

  it('follows the steps Raad streams, then reads the pages on the device', async () => {
    const ctx = testCtx();
    const r = await run(() => streamed([
      { t: 'step', key: 'signin', status: 'start' },
      { t: 'step', key: 'signin', status: 'ok', ms: 900 },
      { t: 'step', key: 'fetch', status: 'start', note: 'center' },
      { t: 'step', key: 'fetch', status: 'ok', ms: 400, note: 'center' },
      { t: 'step', key: 'signout', status: 'ok', ms: 100 },
      { t: 'done', status: 200, body: { pages: { center: CENTER }, errors: {}, log: [], fetchedAt: '2026-10-22T10:00:00Z' } },
    ]), ctx);
    expect(r.data.sections?.length).toBe(2);
    expect(ctx.steps).toEqual(['connect:start', 'connect:ok', 'signin:start', 'signin:ok', 'fetch:start', 'fetch:ok', 'signout:ok', 'extract:start', 'extract:ok']);
    expect(ctx.events.find(e => e.key === 'fetch')?.areas).toEqual(['student', 'schedule', 'notices']);
  });

  it('a stream that ends in a failure is that failure; a cut stream is worth another try', async () => {
    const fail = await run(() => streamed([{ t: 'step', key: 'signin', status: 'start' }, { t: 'done', status: 401, body: { code: 'BAD_CREDENTIALS' } }])).catch(e => e);
    expect(fail.kind).toBe('CREDENTIALS');
    const cut = await run(() => streamed([{ t: 'step', key: 'signin', status: 'start' }])).catch(e => e);
    expect(cut.kind).toBe('TRANSIENT');
  });

  it('a paused Raad is not retried', async () => {
    const e = await run(() => new Response(JSON.stringify({ code: 'PAUSED' }), { status: 503 })).catch(x => x);
    expect(e.kind).toBe('PAUSED');
  });

  it('marks the areas of a failed page and keeps the rest', async () => {
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
    expect(await kind(429, 'LOCKED')).toBe('CREDENTIALS'); // waiting would only extend the lock
    expect(await kind(502, 'NOT_AUTHORIZED')).toBe('SESSION');
    expect(await kind(502, 'TIMEOUT')).toBe('TRANSIENT');
    expect(await kind(400, 'BAD_REQUEST')).toBe('UNEXPECTED');
    expect(await kind(403, 'ACCOUNT')).toBe('CREDENTIALS'); // only the college can unlock an account
    expect(await kind(503, 'COOLDOWN')).toBe('PAUSED'); // Raad rests: no retrying until he is back
    expect(await kind(503, 'UNAVAILABLE')).toBe('UNEXPECTED');
    expect(await run(() => { throw new TypeError('offline'); }).catch((e: RaadError) => e.kind)).toBe('TRANSIENT');
  });

  it('a sync where every page failed with a dead session asks Raad for a new one', async () => {
    const e = await run(() => ok({ pages: {}, errors: { center: 'NOT_AUTHORIZED', grades: 'SESSION_EXPIRED' } })).catch(x => x);
    expect(e).toBeInstanceOf(RaadError);
    expect(e.kind).toBe('SESSION');
  });

  it('asks only for the pages whose areas are due, and leaves the others as they are', async () => {
    const asked: unknown[] = [];
    const src = createPeopleSoftSource({
      fetch: async (_u, init) => {
        const pages: string[] = JSON.parse(String(init?.body)).pages;
        asked.push(pages);
        const all: Record<string, string> = { center: CENTER, grades: GRADES, attendance: ATTENDANCE, exams: EXAMS_SOME };
        return ok({ pages: Object.fromEntries(pages.map(p => [p, all[p]!])) });
      },
      parseHtml: toDoc,
    });
    const r = await src.sync({ ...testCtx(), credentials: { userid: '1', pwd: 'p' }, areas: ['schedule', 'notices'] });
    expect(asked).toEqual([['center']]);
    expect(Object.keys(r.provenance).sort()).toEqual(['notices', 'schedule', 'student']);
    await src.sync({ ...testCtx(), credentials: { userid: '1', pwd: 'p' }, areas: ['exams', 'grades'] });
    expect(asked[1]).toEqual(['grades', 'exams']);
  });

  it('a page whose landmarks are gone is an error, never an empty schedule', async () => {
    const r = await run(() => ok({ pages: { center: '<div id="NEW_LAYOUT">Welcome</div>', grades: GRADES } }));
    expect(r.provenance.schedule).toEqual({ status: 'error', error: 'PARSE' });
    expect(r.data.sections).toBeUndefined();
    expect(r.provenance.grades?.status).toBe('fresh');
  });

  it('gives up an attempt that takes too long', async () => {
    const src = createPeopleSoftSource({
      timeoutMs: 20,
      fetch: (_u, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      parseHtml: toDoc,
    });
    const e = await src.sync({ ...testCtx(), credentials: { userid: '1', pwd: 'p' } }).catch(x => x);
    expect(e).toMatchObject({ kind: 'TRANSIENT', message: 'TIMEOUT' });
  });

  it('never sends credentials anywhere but the configured endpoint, and requires them', async () => {
    const seen: string[] = [];
    const src = createPeopleSoftSource({ endpoint: '/api/v1/sync', fetch: async url => { seen.push(String(url)); return ok({ pages: { center: CENTER } }); }, parseHtml: toDoc });
    await src.sync({ ...testCtx(), credentials: { userid: '1', pwd: 'p' } });
    expect(seen).toEqual(['/api/v1/sync']);
    await expect(src.sync(testCtx())).rejects.toMatchObject({ kind: 'CREDENTIALS' });
  });
});
