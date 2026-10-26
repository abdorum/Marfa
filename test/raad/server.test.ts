// Raad's server (raad/server/router.ts) in front of a fake PeopleSoft portal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idKey, LOCK_SECONDS, MAX_FAILURES, resetGuardMemory, type RateLimit, type Store } from '../../raad/server/guard';
import { handleApi, resetHealthCache, type Env } from '../../raad/server/router';
import { fakePortal } from '../peoplesoft/fake-portal';

beforeEach(() => { resetGuardMemory(); resetHealthCache(); });
afterEach(() => vi.unstubAllGlobals());

const SITE = { Origin: 'https://taleeb-portal.pages.dev' };
const DEV: Env = { RAAD_DEV: '1' };

const post = (body: unknown, path = '/api/v1/sync', env: Env = DEV, headers: Record<string, string> = SITE) =>
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

const allow: RateLimit = { limit: async () => ({ success: true }) };
/** Everything production binds, so the protections are all there. */
const production = (store: Store): Env => ({ GUARD: store, IP_LIMIT: allow, ID_LIMIT: allow, GLOBAL_LIMIT: allow, ID_KEY: 'test-secret' });

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
    // A body that announces it is too big is refused before it is read.
    expect((await post('{}', '/api/v1/sync', DEV, { ...SITE, 'Content-Length': '100000' })).status).toBe(413);
    expect((await post({}, '/api/v1/other')).status).toBe(404);
    expect(portal.log).toHaveLength(0);
  });

  it('ignores page names outside the allowlist, and pages the owner turned off', async () => {
    const portal = fakePortal();
    const res = await post({ userid: '1', pwd: 'secret', pages: ['grades', 'SSS_MY_ACAD', '../x'] });
    expect(res.status).toBe(200);
    expect(portal.log.filter(l => l.includes('/c/'))).toEqual(['GET /psc/hp/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL']);
    portal.log.length = 0;
    await post({ userid: '1', pwd: 'secret' }, undefined, { ...DEV, RAAD_DISABLE_PAGES: 'attendance, exams' });
    expect(portal.log.filter(l => l.includes('/c/')).map(l => l.split('/c/')[1])).toEqual([
      'SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL', 'SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL',
    ]);
  });

  it('only the site itself may post: other websites, no Origin, cross-site fetches and non-JSON are refused', async () => {
    const portal = fakePortal();
    const ok = { userid: '1', pwd: 'secret' };
    expect((await post(ok, undefined, DEV, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(ok, undefined, DEV, { Origin: 'https://ties-bmc.pages.dev' })).status).toBe(403);
    expect((await post(ok, undefined, DEV, {})).status).toBe(403);
    expect((await post(ok, undefined, DEV, { ...SITE, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post(ok, undefined, DEV, { ...SITE, 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await post({ userid: '1 OR 1=1', pwd: 'secret' })).status).toBe(400);
    expect((await post({ userid: '1', pwd: 'x'.repeat(129) })).status).toBe(400);
    expect(portal.log).toHaveLength(0);
    expect((await post(ok, undefined, DEV, { ...SITE, 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect((await post(ok, undefined, DEV, { Origin: 'http://localhost:5173' })).status).toBe(200);
  });

  it('rests an ID after too many wrong passwords, without asking the portal again', async () => {
    const portal = fakePortal();
    const { store, map } = memoryStore();
    const env = production(store);
    expect(MAX_FAILURES).toBe(3);
    for (let i = 0; i < MAX_FAILURES; i++) expect((await post({ userid: '2412345', pwd: 'nope' }, undefined, env)).status).toBe(401);
    const signIns = portal.log.filter(l => l.startsWith('POST')).length;
    const res = await post({ userid: '2412345', pwd: 'secret' }, undefined, env);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'LOCKED' });
    expect(portal.log.filter(l => l.startsWith('POST'))).toHaveLength(signIns);
    // The store holds a keyed pseudonym and a TTL, never the student ID, nor its plain hash.
    const key = [...map.keys()][0]!;
    expect(key).not.toContain('2412345');
    expect(key).toBe(`fail:${await idKey('2412345', 'test-secret')}`);
    expect(key).not.toBe(`fail:${await idKey('2412345')}`);
    expect(map.get(key)?.ttl).toBe(LOCK_SECONDS);
  });

  it('a right password clears earlier wrong ones', async () => {
    fakePortal();
    const { store, map } = memoryStore();
    await post({ userid: '7', pwd: 'nope' }, undefined, production(store));
    expect(map.size).toBe(1);
    expect((await post({ userid: '7', pwd: 'secret' }, undefined, production(store))).status).toBe(200);
    expect(map.size).toBe(0);
  });

  it('a college error during sign-in is not a wrong password', async () => {
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit = {}) =>
      new Response(init.method === 'POST' ? '<h1>Down for maintenance</h1>' : '<form action="?cmd=login"><input name="pwd"></form>'));
    const { store, map } = memoryStore();
    const res = await post({ userid: '8', pwd: 'secret' }, undefined, production(store));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'UPSTREAM' });
    expect([...map.keys()].filter(k => k.startsWith('fail:'))).toEqual([]);
  });

  it('one sync per ID at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    fakePortal();
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', async (...a: Parameters<typeof fetch>) => { await gate; return real(...a); });
    const first = post({ userid: '5', pwd: 'secret' });
    const second = await post({ userid: '5', pwd: 'secret' });
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: 'BUSY' });
    release();
    expect((await first).status).toBe(200);
  });

  it('rate limits by device, by ID and for Raad as a whole', async () => {
    const portal = fakePortal();
    const keys: string[] = [];
    const no: RateLimit = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
    // The Pages Function passes the student's address on; Raad has no public address of his own.
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, { ...DEV, IP_LIMIT: no }, { ...SITE, 'X-Taleeb-Client-IP': '203.0.113.9' })).status).toBe(429);
    expect(keys).toEqual(['203.0.113.9']);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, { ...DEV, ID_LIMIT: no })).status).toBe(429);
    expect((await post({ userid: '1', pwd: 'secret' }, undefined, { ...DEV, GLOBAL_LIMIT: no })).status).toBe(429);
    expect(portal.log).toHaveLength(0);
  });

  it('fails closed: a protection that is missing or broken refuses the sync', async () => {
    const portal = fakePortal();
    const { store } = memoryStore();
    const ok = { userid: '1', pwd: 'secret' };
    // Not dev, and nothing bound (a misconfigured deploy): refused.
    expect(await (await post(ok, undefined, {})).json()).toMatchObject({ code: 'UNAVAILABLE' });
    // Everything bound but the secret: refused.
    expect((await post(ok, undefined, { ...production(store), ID_KEY: undefined })).status).toBe(503);
    // A rate limit that errors: refused.
    const broken: RateLimit = { limit: async () => { throw new Error('down'); } };
    expect((await post(ok, undefined, { ...production(store), ID_LIMIT: broken })).status).toBe(503);
    // A store that cannot be read: refused.
    const dead: Store = { get: async () => { throw new Error('kv'); }, put: async () => {}, delete: async () => {} };
    expect((await post(ok, undefined, production(dead))).status).toBe(503);
    expect(portal.log).toHaveLength(0);
    expect((await post(ok, undefined, production(store))).status).toBe(200);
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

describe('resting', () => {
  it('rests an hour for everyone after the college firewall refuses Raad', async () => {
    vi.stubGlobal('fetch', async () => new Response('Forbidden', { status: 403 }));
    const { store, map } = memoryStore();
    const env = production(store);
    expect((await post({ userid: '1', pwd: 'x' }, undefined, env)).status).toBe(502);
    expect(map.get('cooldown')?.ttl).toBe(3600);
    const portal = fakePortal();
    const res = await post({ userid: '2', pwd: 'secret' }, undefined, env);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'COOLDOWN' });
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(3500);
    expect(portal.log).toHaveLength(0);
    // Devices see it as a pause, with when it ends.
    const status = await (await handleApi(new Request('http://x/api/v1/status'), env)).json();
    expect(status).toMatchObject({ paused: true, auto: true });
    expect(Date.parse(status.until)).toBeGreaterThan(Date.now());
  });

  it('rests five minutes after the college keeps failing', async () => {
    vi.stubGlobal('fetch', async () => new Response('busy', { status: 503 }));
    const { store, map } = memoryStore();
    for (let i = 0; i < 5; i++) await post({ userid: String(i), pwd: 'x' }, undefined, production(store));
    expect(map.get('cooldown')?.ttl).toBe(300);
  });
});

describe('streaming', () => {
  const ndjson = { ...SITE, Accept: 'application/x-ndjson' };

  it('streams each step, then the result', async () => {
    fakePortal();
    const res = await post({ userid: '1', pwd: 'secret', pages: ['grades'] }, undefined, DEV, ndjson);
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
    const res = await post({ userid: '9', pwd: 'nope' }, undefined, production(store), ndjson);
    expect(res.status).toBe(200);
    const all = await lines(res);
    expect(all.map(l => `${l.t}:${l.key ?? l.status}`)).toEqual(['step:signin', 'step:signin', 'done:401']);
    expect(all.at(-1)).toMatchObject({ body: { code: 'BAD_CREDENTIALS' } });
    expect(map.size).toBe(1);
  });

  it('refusals before signing in stay plain JSON with their status', async () => {
    fakePortal();
    const res = await post({ userid: '1 OR 1=1', pwd: 'x' }, undefined, DEV, ndjson);
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('the owner’s switches', () => {
  const get = (path: string, env: Env = {}) => handleApi(new Request(`http://x${path}`), env);

  it('status tells whether Raad is paused, the announcement and the version, without reaching the college', async () => {
    const portal = fakePortal();
    expect(await (await get('/api/v1/status')).json()).toEqual({ paused: false, version: '1.2.1' });
    const env: Env = {
      RAAD_PAUSED: '1', RAAD_MESSAGE_AR: 'متوقف للصيانة', NOTICE_AR: 'اختبارات منتصف الفصل الأحد', NOTICE_EN: 'Midterms on Sunday',
      RAAD_STALE_MINUTES: '60', CF_VERSION_METADATA: { id: '0123456789abcdef' },
    };
    expect(await (await get('/api/v1/status', env)).json()).toEqual({
      paused: true, message: { ar: 'متوقف للصيانة' }, notice: { ar: 'اختبارات منتصف الفصل الأحد', en: 'Midterms on Sunday' },
      staleMinutes: 60, version: '1.2.1', build: '01234567',
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

  it('health reaches the college once a minute at most', async () => {
    const portal = fakePortal();
    for (let i = 0; i < 5; i++) expect((await get('/api/v1/health')).status).toBe(200);
    expect(portal.log).toHaveLength(1);
  });

  it('health says only whether the college answered, nothing of what it said', async () => {
    vi.stubGlobal('fetch', async () => new Response('Request blocked. Ref A: 123', { status: 403, headers: { server: 'x', 'x-azure-ref': 'y' } }));
    expect(await (await get('/api/v1/health')).json()).toEqual({ sis: 403, reachable: false });
  });
});

describe('metrics', () => {
  it('keeps only whitelisted, bounded metric fields', async () => {
    const points: unknown[] = [];
    const env: Env = { ...DEV, METRICS: { writeDataPoint: (p: unknown) => points.push(p) } };
    const send = (body: unknown) => post(body, '/api/v1/metrics', env);
    const good = { jobType: 'sync', outcome: 'succeeded', attempts: 2, sessionResets: 1, errorClasses: ['grades:NOT_AUTHORIZED', 'evil'], durationMs: 5300, appVersion: '1.0.0', userid: '2412345' };
    expect((await send(good)).status).toBe(204);
    expect(points).toEqual([{ indexes: ['sync'], blobs: ['sync', 'succeeded', '1.0.0', 'NOT_AUTHORIZED'], doubles: [2, 1, 5300] }]);
    expect(JSON.stringify(points)).not.toContain('2412345');
    expect((await send({ ...good, attempts: -1 })).status).toBe(400);
    expect((await send({ ...good, jobType: 'x' })).status).toBe(400);
    expect((await post(good, '/api/v1/metrics')).status).toBe(204); // no binding: accepted, dropped
  });

  it('counts every sync on the server with codes only: no ID, no address', async () => {
    fakePortal();
    const points: { blobs?: string[] }[] = [];
    const env: Env = { ...DEV, METRICS: { writeDataPoint: p => points.push(p) } };
    await post({ userid: '2412345', pwd: 'secret' }, undefined, env, { ...SITE, 'X-Taleeb-Client-IP': '203.0.113.9' });
    await post({ userid: '2412345', pwd: 'nope' }, undefined, env);
    expect(points.map(p => p.blobs?.[1])).toEqual(['OK', 'BAD_CREDENTIALS']);
    expect(JSON.stringify(points)).not.toMatch(/2412345|203\.0\.113\.9/);
  });
});
