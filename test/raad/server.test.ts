// Raad's server (raad/server/router.ts) in front of a fake PeopleSoft portal.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCK_SECONDS, MAX_FAILURES, type Store } from '../../raad/server/guard';
import { handleApi, type Env } from '../../raad/server/router';
import { fakePortal } from '../peoplesoft/fake-portal';

afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown, path = '/api/v1/sync', env: Env = {}, headers: Record<string, string> = {}) =>
  handleApi(new Request(`http://x${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);

function memoryStore() {
  const map = new Map<string, { value: string; ttl?: number }>();
  const store: Store = {
    get: async k => map.get(k)?.value ?? null,
    put: async (k, value, o) => { map.set(k, { value, ttl: o?.expirationTtl }); },
    delete: async k => { map.delete(k); },
  };
  return { store, map };
}

/** All NDJSON lines of a streamed response. */
const lines = async (res: Response) => (await res.text()).trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>);

describe('sync', () => {
  it('wrong password is a 401 with one sign-in attempt only', async () => {
    const portal = fakePortal();
    const res = await post({ userid: '1', pwd: 'nope' });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'BAD_CREDENTIALS' });
    expect(body.detail).not.toContain('nope'); // the trace never carries the password
    expect(portal.log.filter(l => l.startsWith('POST'))).toHaveLength(1);
  });

  it('a firewall 403 is reported as BLOCKED, never as a wrong password', async () => {
    vi.stubGlobal('fetch', async () => new Response('Forbidden', { status: 403 }));
    const res = await post({ userid: '1', pwd: 'right' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'BLOCKED' });
  });

  it('rejects bad requests before contacting the portal', async () => {
    const portal = fakePortal();
    expect((await post('{"userid":"1"}')).status).toBe(400);
    expect((await post('x'.repeat(5000))).status).toBe(413);
    expect((await post({}, '/api/v1/other')).status).toBe(404);
    expect(portal.log).toHaveLength(0);
  });

  it('ignores page names outside the allowlist', async () => {
    const portal = fakePortal();
    const res = await post({ userid: '1', pwd: 'secret', pages: ['grades', 'SSS_MY_ACAD', '../x'] });
    expect(res.status).toBe(200);
    expect(portal.log.filter(l => l.includes('/c/'))).toEqual(['GET /psc/hp/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL']);
  });

  it('refuses other websites and non-JSON posts before contacting the portal', async () => {
    const portal = fakePortal();
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, {}, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, {}, { Origin: 'https://ties-bmc.pages.dev' })).status).toBe(403);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, {}, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post({ userid: '1 OR 1=1', pwd: 'secret' })).status).toBe(400);
    expect((await post({ userid: '1', pwd: 'x'.repeat(129) })).status).toBe(400);
    expect(portal.log).toHaveLength(0);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, {}, { Origin: 'https://taleeb-portal.pages.dev' })).status).toBe(200);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, {}, { Origin: 'http://localhost:5173' })).status).toBe(200);
  });

  it('rests an ID after too many wrong passwords, without asking the portal again', async () => {
    const portal = fakePortal();
    const { store, map } = memoryStore();
    for (let i = 0; i < MAX_FAILURES; i++) expect((await post({ userid: '2412345', pwd: 'nope' }, undefined, { GUARD: store })).status).toBe(401);
    const signIns = portal.log.filter(l => l.startsWith('POST')).length;
    const res = await post({ userid: '2412345', pwd: 'secret' }, undefined, { GUARD: store });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'LOCKED' });
    expect(portal.log.filter(l => l.startsWith('POST'))).toHaveLength(signIns);
    // The store holds a hash and a TTL, never the student ID.
    expect([...map.keys()].join()).not.toContain('2412345');
    expect([...map.values()][0]?.ttl).toBe(LOCK_SECONDS);
  });

  it('a right password clears earlier wrong ones', async () => {
    fakePortal();
    const { store, map } = memoryStore();
    await post({ userid: '7', pwd: 'nope' }, undefined, { GUARD: store });
    expect(map.size).toBe(1);
    expect((await post({ userid: '7', pwd: 'secret' }, undefined, { GUARD: store })).status).toBe(200);
    expect(map.size).toBe(0);
  });

  it('rate limits by device and by ID', async () => {
    const portal = fakePortal();
    const keys: string[] = [];
    const no = { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: false }; } };
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, { IP_LIMIT: no }, { 'CF-Connecting-IP': '203.0.113.9' })).status).toBe(429);
    expect(keys).toEqual(['203.0.113.9']);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, { ID_LIMIT: no })).status).toBe(429);
    expect(portal.log).toHaveLength(0);
  });

  it('never follows a redirect off the college system', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(new URL(url).host);
      return new Response(null, { status: 302, headers: { Location: 'https://evil.example/steal' } });
    });
    const res = await post({ userid: '1', pwd: 'secret' });
    expect(res.status).toBe(502);
    expect(seen.every(h => h === 'sis.bmc.edu.sa')).toBe(true);
  });
});

describe('streaming', () => {
  const ndjson = { Accept: 'application/x-ndjson' };

  it('streams each step, then the result', async () => {
    fakePortal();
    const res = await post({ userid: '1', pwd: 'secret', pages: ['grades'] }, undefined, {}, ndjson);
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson');
    expect(res.headers.get('Cache-Control')).toContain('no-transform');
    const all = await lines(res);
    expect(all.filter(l => l.t === 'step').map(l => `${l.key}:${l.status}`)).toEqual([
      'signin:start', 'signin:ok', 'fetch:start', 'fetch:ok', 'signout:start', 'signout:ok',
    ]);
    const done = all.at(-1)!;
    expect(done).toMatchObject({ t: 'done', status: 200 });
    expect(Object.keys((done.body as { pages: object }).pages)).toEqual(['grades']);
  });

  it('a wrong password ends the stream with its status, and is still counted', async () => {
    fakePortal();
    const { store, map } = memoryStore();
    const res = await post({ userid: '9', pwd: 'nope' }, undefined, { GUARD: store }, ndjson);
    expect(res.status).toBe(200);
    const all = await lines(res);
    expect(all.map(l => `${l.t}:${l.key ?? l.status}`)).toEqual(['step:signin', 'step:signin', 'done:401']);
    expect(all.at(-1)).toMatchObject({ body: { code: 'BAD_CREDENTIALS' } });
    expect(map.size).toBe(1);
  });

  it('refusals before signing in stay plain JSON with their status', async () => {
    fakePortal();
    const res = await post({ userid: '1 OR 1=1', pwd: 'x' }, undefined, {}, ndjson);
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('the owner’s switches', () => {
  const get = (path: string, env: Env = {}) => handleApi(new Request(`http://x${path}`), env);

  it('status tells whether Raad is paused, and the announcement, without reaching the college', async () => {
    const portal = fakePortal();
    expect(await (await get('/api/v1/status')).json()).toEqual({ paused: false });
    const env: Env = { RAAD_PAUSED: '1', RAAD_MESSAGE_AR: 'متوقف للصيانة', NOTICE_AR: 'اختبارات منتصف الفصل الأحد', NOTICE_EN: 'Midterms on Sunday' };
    expect(await (await get('/api/v1/status', env)).json()).toEqual({
      paused: true, message: { ar: 'متوقف للصيانة' }, notice: { ar: 'اختبارات منتصف الفصل الأحد', en: 'Midterms on Sunday' },
    });
    expect(portal.log).toHaveLength(0);
  });

  it('a paused Raad refuses every sync before touching anything', async () => {
    const portal = fakePortal();
    const res = await post({ userid: '1', pwd: 'secret' }, undefined, { RAAD_PAUSED: 'true', RAAD_MESSAGE_EN: 'Paused' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: 'PAUSED', message: { en: 'Paused' } });
    expect(portal.log).toHaveLength(0);
  });
});

describe('metrics', () => {
  it('keeps only whitelisted, bounded metric fields', async () => {
    const points: unknown[] = [];
    const env = { METRICS: { writeDataPoint: (p: unknown) => points.push(p) } };
    const send = (body: unknown) => post(body, '/api/v1/metrics', env);
    const good = { jobType: 'sync', outcome: 'succeeded', attempts: 2, sessionResets: 1, errorClasses: ['grades:NOT_AUTHORIZED', 'evil'], durationMs: 5300, appVersion: '1.0.0', userid: '2412345' };
    expect((await send(good)).status).toBe(204);
    expect(points).toEqual([{ indexes: ['sync'], blobs: ['sync', 'succeeded', '1.0.0', 'NOT_AUTHORIZED'], doubles: [2, 1, 5300] }]);
    expect(JSON.stringify(points)).not.toContain('2412345');
    expect((await send({ ...good, attempts: -1 })).status).toBe(400);
    expect((await send({ ...good, jobType: 'x' })).status).toBe(400);
    expect((await post(good, '/api/v1/metrics')).status).toBe(204); // no binding: accepted, dropped
  });
});
