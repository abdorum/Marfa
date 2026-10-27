// The owner's page talking to Raad (raad/server/admin.ts): the key, the
// switches and what they do to the students' Raad, the rest, the statistics.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGuardMemory, startCooldown, type RateLimit, type Store } from '../../raad/server/guard';
import { handleApi, resetHealthCache, type Env } from '../../raad/server/router';
import { resetStatsMemory } from '../../raad/server/stats';
import { sqliteDb } from '../../src/dev/sqlite-db';
import { fakePortal } from '../peoplesoft/fake-portal';

beforeEach(() => { resetGuardMemory(); resetHealthCache(); resetStatsMemory(0); });
afterEach(() => vi.unstubAllGlobals());

const KEY = 'owner-key-0123456789-abcdefghijklmnop';
const SITE = { Origin: 'https://taleeb-portal.pages.dev' };
const allow: RateLimit = { limit: async () => ({ success: true }) };

function memoryStore(): Store & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: async k => map.get(k) ?? null, put: async (k, v) => { map.set(k, v); }, delete: async k => { map.delete(k); } };
}

/** Raad as deployed, with the owner's key, and a way to call the owner's API and the students' one. */
function deployed(extra: Partial<Env> = {}) {
  const store = memoryStore();
  const env: Env = { GUARD: store, IP_LIMIT: allow, ID_LIMIT: allow, GLOBAL_LIMIT: allow, ID_KEY: 'test-secret', ADMIN_KEY: KEY, STATS: sqliteDb(), ...extra };
  const later: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void later.push(p) };
  const admin = async (path: string, o: { method?: string; body?: unknown; key?: string | null; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...SITE, ...o.headers };
    if (o.key !== null) headers.Authorization = `Bearer ${o.key ?? KEY}`;
    if (o.body !== undefined) headers['Content-Type'] ??= 'application/json';
    const body = o.body === undefined ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body);
    return handleApi(new Request(`http://x/api/v1/admin/${path}`, { method: o.method ?? 'GET', headers, body }), env, ctx);
  };
  const status = async () => (await handleApi(new Request('http://x/api/v1/status'), env, ctx)).json();
  const sync = async () => {
    const res = await handleApi(new Request('http://x/api/v1/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...SITE }, body: JSON.stringify({ userid: '2412345', pwd: 'secret' }),
    }), env, ctx);
    await Promise.all(later);
    return res;
  };
  return { env, store, admin, status, sync };
}

describe('the key', () => {
  it('the page is closed to everyone until the owner sets a long key', async () => {
    expect(await (await deployed({ ADMIN_KEY: undefined }).admin('state')).json()).toEqual({ code: 'NOT_CONFIGURED' });
    // A short key could be guessed: as good as none.
    expect((await deployed({ ADMIN_KEY: 'short-key' }).admin('state', { key: 'short-key' })).status).toBe(503);
    const { admin } = deployed();
    expect((await admin('state', { key: null })).status).toBe(401);
    expect((await admin('state', { key: `${KEY}x` })).status).toBe(401);
    expect((await admin('state', { key: KEY.slice(0, -1) })).status).toBe(401);
    expect((await admin('state')).status).toBe(200);
  });

  it('every call is limited per address, before the key is even looked at', async () => {
    const keys: string[] = [];
    const no: RateLimit = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
    const { admin } = deployed({ IP_LIMIT: no });
    expect((await admin('state', { headers: { 'X-Taleeb-Client-IP': '203.0.113.9' } })).status).toBe(429);
    expect(keys).toEqual(['admin:203.0.113.9']);
    // And without the limit bound, outside dev, the page stays closed.
    expect((await deployed({ IP_LIMIT: undefined }).admin('state')).status).toBe(503);
  });

  it('a change must come from the site itself; reading needs the key only', async () => {
    const { admin } = deployed();
    expect((await admin('switches', { method: 'PUT', body: { paused: true }, headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await admin('rest', { method: 'DELETE', headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await admin('state', { headers: { Origin: 'https://evil.example' } })).status).toBe(200);
  });
});

describe('the switches', () => {
  it('pause Raad with the owner’s words, before anything reaches the college', async () => {
    const portal = fakePortal();
    const { admin, status, sync } = deployed();
    const put = await admin('switches', { method: 'PUT', body: { paused: true, message: { ar: 'صيانةٌ حتى المغرب', en: 'Maintenance until sunset' } } });
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ page: { paused: true, message: { ar: 'صيانةٌ حتى المغرب' }, at: expect.any(String) } });
    expect(await status()).toMatchObject({ paused: true, message: { ar: 'صيانةٌ حتى المغرب', en: 'Maintenance until sunset' } });
    const res = await sync();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: 'PAUSED', message: { ar: 'صيانةٌ حتى المغرب', en: 'Maintenance until sunset' } });
    expect(portal.log).toHaveLength(0);
    await admin('switches', { method: 'PUT', body: { paused: false } });
    expect(await status()).toMatchObject({ paused: false });
    expect((await sync()).status).toBe(200);
  });

  it('post an announcement, skip parts, and slow the devices’ refreshes', async () => {
    const portal = fakePortal();
    const { admin, status, sync } = deployed();
    await admin('switches', { method: 'PUT', body: { notice: { ar: 'اختبارات منتصف الفصل الأحد\nبالتوفيق' }, skip: ['attendance', 'exams'], staleMinutes: 120 } });
    expect(await status()).toMatchObject({ paused: false, notice: { ar: 'اختبارات منتصف الفصل الأحد\nبالتوفيق' }, staleMinutes: 120 });
    expect((await sync()).status).toBe(200);
    expect(portal.log.filter(l => l.includes('/c/')).map(l => l.split('/c/')[1])).toEqual([
      'SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL', 'SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL',
    ]);
  });

  it('refuse anything that is not plain, short and known', async () => {
    const { admin, store } = deployed();
    const bad = [
      { notice: { ar: 'x'.repeat(301) } },
      { message: { en: 'x'.repeat(201) } },
      { notice: 'just a string' },
      { skip: ['attendance', 'https://evil.example'] },
      { staleMinutes: 3 },
      { staleMinutes: 2000 },
      { paused: 'yes' },
    ];
    for (const body of bad) expect((await admin('switches', { method: 'PUT', body })).status).toBe(400);
    expect((await admin('switches', { method: 'PUT', body: '{"paused":', headers: { 'Content-Type': 'application/json' } })).status).toBe(400);
    expect((await admin('switches', { method: 'PUT', body: { paused: true }, headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
    expect(store.map.has('switches')).toBe(false);
    // Control characters go; lines stay.
    const ok = await (await admin('switches', { method: 'PUT', body: { notice: { ar: ' سطر\u0007\r\nسطر ' } } })).json();
    expect(ok.page.notice).toEqual({ ar: 'سطر\nسطر' });
  });

  it('the dashboard’s variables still work beside the page', async () => {
    const { admin, status } = deployed({ RAAD_PAUSED: '1', RAAD_MESSAGE_AR: 'من لوحة Cloudflare', NOTICE_AR: 'إعلانٌ قديم', RAAD_STALE_MINUTES: '30' });
    expect(await status()).toMatchObject({ paused: true, message: { ar: 'من لوحة Cloudflare' }, notice: { ar: 'إعلانٌ قديم' }, staleMinutes: 30 });
    // The page cannot undo the dashboard's pause, and its own words come first.
    await admin('switches', { method: 'PUT', body: { paused: false, notice: { ar: 'إعلانٌ جديد' }, staleMinutes: 60 } });
    expect(await status()).toMatchObject({ paused: true, message: { ar: 'من لوحة Cloudflare' }, notice: { ar: 'إعلانٌ جديد' }, staleMinutes: 60 });
    const state = await (await admin('state')).json();
    expect(state).toMatchObject({
      page: { notice: { ar: 'إعلانٌ جديد' }, staleMinutes: 60 },
      dashboard: { paused: true, message: { ar: 'من لوحة Cloudflare' }, notice: { ar: 'إعلانٌ قديم' }, staleMinutes: 30 },
      rest: null, version: '1.3.0', stats: true,
    });
    expect(state.parts).toEqual(['center', 'grades', 'attendance', 'exams']);
  });
});

describe('the rest', () => {
  it('the owner ends Raad’s rest early', async () => {
    const { admin, status, store } = deployed();
    await startCooldown(store, 'BLOCKED', 3600);
    expect(await status()).toMatchObject({ paused: true, auto: true });
    expect((await (await admin('state')).json()).rest).toMatchObject({ reason: 'BLOCKED' });
    expect((await admin('rest', { method: 'DELETE' })).status).toBe(200);
    expect(await status()).toMatchObject({ paused: false });
  });
});

describe('the statistics', () => {
  it('reports the students and the syncs of the last 30 days', async () => {
    fakePortal();
    const { admin, sync } = deployed();
    await sync();
    await sync();
    const r = await (await admin('stats')).json();
    expect(r.students).toEqual({ total: 1, week: 1, month: 1 });
    expect(r.days).toEqual([{ day: r.today, students: 1, new: 1 }]);
    expect(r.counts.find((c: { what: string }) => c.what === 'OK')).toMatchObject({ kind: 'outcome', n: 2 });
  });

  it('without the database, the page says so', async () => {
    expect(await (await deployed({ STATS: undefined }).admin('stats')).json()).toEqual({ code: 'NO_STATS' });
  });
});
