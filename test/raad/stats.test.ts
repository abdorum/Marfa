// The owner's statistics (raad/server/stats.ts) on a real SQLite, alone and
// through Raad's server.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idKey, resetGuardMemory } from '../../raad/server/guard';
import { handleApi, type Env } from '../../raad/server/router';
import { count, countSync, dayOf, forget, pseudonym, purge, readStats, resetStatsMemory, seen, type Db } from '../../raad/server/stats';
import { sqliteDb } from '../../src/dev/sqlite-db';
import { fakePortal } from '../peoplesoft/fake-portal';

beforeEach(() => { resetStatsMemory(0); resetGuardMemory(); });
afterEach(() => vi.unstubAllGlobals());

const DAY = 86_400_000;
/** Noon in Jeddah. */
const NOW = Date.parse('2026-10-27T09:00:00Z');

describe('students', () => {
  it('counts a student once a day, and as new only the first time', async () => {
    const db = sqliteDb();
    const a = await pseudonym('2412345', 'k');
    const b = await pseudonym('2412346', 'k');
    await seen(db, a, NOW - 2 * DAY);
    await seen(db, a, NOW - DAY);
    await seen(db, a, NOW - DAY + 60_000);
    await seen(db, a, NOW);
    await seen(db, b, NOW);
    const r = await readStats(db, NOW);
    expect(r.today).toBe('2026-10-27');
    expect(r.students).toEqual({ total: 2, week: 2, month: 2 });
    expect(r.days).toEqual([
      { day: '2026-10-25', students: 1, new: 1 },
      { day: '2026-10-26', students: 1, new: 0 },
      { day: '2026-10-27', students: 2, new: 1 },
    ]);
  });

  it('the day is Jeddah’s: 23:30 there is still the same day, 00:30 the next', () => {
    expect(dayOf(Date.parse('2026-10-27T20:30:00Z'))).toBe('2026-10-27');
    expect(dayOf(Date.parse('2026-10-27T21:30:00Z'))).toBe('2026-10-28');
  });

  it('keeps nothing that names a student: a pseudonym and two days', async () => {
    const db = sqliteDb();
    await seen(db, await pseudonym('2412345', 'secret'), NOW);
    const rows = db.sql.prepare('SELECT * FROM students').all() as { who: string }[];
    expect(rows).toEqual([{ who: expect.stringMatching(/^[0-9a-f]{32}$/), first_day: '2026-10-27', last_day: '2026-10-27' }]);
    expect(JSON.stringify(rows)).not.toContain('2412345');
    // Not the wrong-password counters' key either, so the two stores never match.
    expect(rows[0]!.who).not.toBe(await idKey('2412345', 'secret'));
  });

  it('forgets a student who signed out', async () => {
    const db = sqliteDb();
    const a = await pseudonym('2412345', 'k');
    await seen(db, a, NOW);
    await seen(db, await pseudonym('2412346', 'k'), NOW);
    await forget(db, a);
    expect((await readStats(db, NOW)).students.total).toBe(1);
  });

  it('deletes pseudonyms a year unused, and counts two years old', async () => {
    const db = sqliteDb();
    await seen(db, await pseudonym('1', 'k'), NOW - 366 * DAY);
    await seen(db, await pseudonym('2', 'k'), NOW - 364 * DAY);
    countSync(db, undefined, 'OK', 900, {}, NOW - 731 * DAY);
    countSync(db, undefined, 'OK', 900, {}, NOW - 729 * DAY);
    await readStats(db, NOW);
    await purge(db, NOW);
    expect(db.sql.prepare('SELECT count(*) AS n FROM students').get()).toEqual({ n: 1 });
    expect(db.sql.prepare('SELECT min(day) AS d FROM counts').get()).toEqual({ d: dayOf(NOW - 729 * DAY) });
    expect(db.sql.prepare('SELECT count(*) AS n FROM days').get()).toEqual({ n: 2 });
  });
});

describe('counts', () => {
  it('wait in memory, and a burst is written at once', async () => {
    const db = sqliteDb();
    let batches = 0;
    const spy: Db = { prepare: s => db.prepare(s), batch: s => { batches++; return db.batch(s); } };
    resetStatsMemory(60_000);
    for (let i = 0; i < 5; i++) countSync(spy, undefined, 'OK', 1000, {}, NOW);
    countSync(spy, undefined, 'PARTIAL', 3000, { attendance: 'TIMEOUT' }, NOW);
    count(spy, undefined, 'open', '1.4.0', 0, NOW);
    expect(batches).toBe(0);
    const r = await readStats(spy, NOW);
    // The tables, the counts, and the report: three batches for seven events.
    expect(batches).toBe(3);
    const at = (kind: string, what: string) => r.counts.find(c => c.kind === kind && c.what === what);
    expect(at('outcome', 'OK')).toMatchObject({ n: 5, ms: 5000 });
    expect(at('outcome', 'PARTIAL')).toMatchObject({ n: 1, ms: 3000 });
    expect(at('hour', '12')).toMatchObject({ n: 6 });
    expect(at('part', 'attendance:TIMEOUT')).toMatchObject({ n: 1 });
    expect(at('open', '1.4.0')).toMatchObject({ n: 1 });
  });

  it('a database that fails loses the counts, and never throws', async () => {
    const broken: Db = { prepare: () => { throw new Error('d1'); }, batch: async () => { throw new Error('d1'); } };
    expect(() => countSync(broken, undefined, 'OK', 10)).not.toThrow();
    await expect(seen(broken, 'x')).resolves.toBeUndefined();
  });
});

describe('through Raad', () => {
  const SITE = { Origin: 'https://taleeb-portal.pages.dev' };

  /** Raad with statistics, and every promise it leaves behind awaited. */
  function raad() {
    const db = sqliteDb();
    const later: Promise<unknown>[] = [];
    const env: Env = { RAAD_DEV: '1', STATS: db, ID_KEY: 'test-secret' };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await handleApi(new Request(`http://x${path}`, init), env, { waitUntil: p => void later.push(p) });
      await res.clone().text();
      await Promise.all(later);
      return res;
    };
    const sync = (userid: string, pwd: string, headers: Record<string, string> = {}) =>
      call('/api/v1/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', ...SITE, ...headers }, body: JSON.stringify({ userid, pwd }) });
    return { db, env, call, sync };
  }

  it('counts every sync and every opening with codes only: no ID, no address', async () => {
    fakePortal();
    const { db, call, sync } = raad();
    expect((await sync('2412345', 'secret', { 'X-Taleeb-Client-IP': '203.0.113.9' })).status).toBe(200);
    expect((await sync('2412345', 'nope')).status).toBe(401);
    await call('/api/v1/status', { headers: { 'X-Taleeb-App': '1.4.0' } });
    await call('/api/v1/status', { headers: { 'X-Taleeb-App': '1.2.1' } });
    await call('/api/v1/status', { headers: { 'X-Taleeb-App': '9.9.9' } });
    await call('/api/v1/status');
    const r = await readStats(db);
    expect(r.students.total).toBe(1);
    const outcomes = Object.fromEntries(r.counts.filter(c => c.kind === 'outcome').map(c => [c.what, c.n]));
    expect(outcomes).toEqual({ OK: 1, BAD_CREDENTIALS: 1 });
    const opens = Object.fromEntries(r.counts.filter(c => c.kind === 'open').map(c => [c.what, c.n]));
    expect(opens).toEqual({ '1.4.0': 1, older: 1, unknown: 2 });
    const everything = JSON.stringify([db.sql.prepare('SELECT * FROM students').all(), db.sql.prepare('SELECT * FROM counts').all()]);
    expect(everything).not.toMatch(/2412345|203\.0\.113\.9|secret|nope/);
  });

  it('a refusal before the college is counted by its code', async () => {
    const portal = fakePortal();
    const { db, env, sync } = raad();
    env.RAAD_PAUSED = '1';
    expect((await sync('1', 'secret')).status).toBe(503);
    expect(portal.log).toHaveLength(0);
    expect((await readStats(db)).counts).toEqual([expect.objectContaining({ kind: 'outcome', what: 'PAUSED', n: 1 })]);
  });

  it('a student who signs out leaves the statistics, with the same answer either way', async () => {
    fakePortal();
    const { db, call, sync } = raad();
    await sync('2412345', 'secret');
    const bye = (userid: unknown, headers: Record<string, string> = SITE) =>
      call('/api/v1/forget', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ userid }) });
    expect((await bye('2412345')).status).toBe(204);
    expect((await bye('2412345')).status).toBe(204);
    expect((await readStats(db)).students.total).toBe(0);
    expect((await bye('1 OR 1=1')).status).toBe(400);
    expect((await bye('2412345', { Origin: 'https://evil.example' })).status).toBe(403);
  });
});
