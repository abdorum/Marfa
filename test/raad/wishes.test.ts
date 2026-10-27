// Colleges students asked for (raad/server/wishes.ts): one row per college
// however it is written, nothing that points to the student, and the owner's
// page reads and trims the list.
import { beforeEach, describe, expect, it } from 'vitest';
import { resetGuardMemory, type RateLimit } from '../../raad/server/guard';
import { handleApi, type Env } from '../../raad/server/router';
import { resetStatsMemory } from '../../raad/server/stats';
import { addWish, MAX_WISHES, parseWish, purgeWishes, readWishes, resetWishesMemory, systemHost, wishKey } from '../../raad/server/wishes';
import { sqliteDb } from '../../src/dev/sqlite-db';

beforeEach(() => { resetGuardMemory(); resetStatsMemory(0); resetWishesMemory(); });

const KEY = 'owner-key-0123456789-abcdefghijklmnop';
const SITE = { Origin: 'https://taleeb-portal.pages.dev' };
const allow: RateLimit = { limit: async () => ({ success: true }) };
const DAY = 86_400_000;

describe('one college, however it is written', () => {
  it('gives the same key to the spellings of one name', () => {
    const k = wishKey('جامعة الملك عبدالعزيز');
    expect(wishKey('جامعه الملك عبدالعزيز')).toBe(k);
    expect(wishKey('  الجامعة   المَلِك عبدالعزيز ')).toBe(k);
    expect(wishKey('كلية ابن سينا')).toBe(wishKey('كليه إبن سينا'));
    expect(wishKey('The University of Jeddah')).toBe(wishKey('jeddah'));
    expect(wishKey('Fakeeh College')).not.toBe(wishKey('Batterjee College'));
  });

  it('keeps only the host of a system address, and nothing that is not one', () => {
    expect(systemHost('https://sis.example.edu.sa/psp/login?x=1')).toBe('sis.example.edu.sa');
    expect(systemHost('Portal.Example.edu')).toBe('portal.example.edu');
    expect(systemHost('javascript:alert(1)')).toBe('');
    expect(systemHost('لا أعرف')).toBe('');
    expect(systemHost('')).toBe('');
  });

  it('refuses a request without a name, and cleans what it keeps', () => {
    expect(parseWish({})).toBeUndefined();
    expect(parseWish({ name: ' ك ' })).toBeUndefined();
    const w = parseWish({ name: 'كلية‮  فقيه\n', city: 'جدة'.repeat(30), system: 'sis.fakeeh.edu.sa', userid: '2412345' })!;
    expect(w.name).toBe('كلية فقيه');
    expect(w.city.length).toBe(40);
    expect(w.system).toBe('sis.fakeeh.edu.sa');
    expect(Object.keys(w).sort()).toEqual(['city', 'key', 'name', 'system']);
  });
});

describe('the list', () => {
  it('counts each college, most asked first, keeping the first spelling and the latest city', async () => {
    const db = sqliteDb();
    const t = Date.parse('2026-10-27T09:00:00Z');
    await addWish(db, parseWish({ name: 'جامعة جدة' })!, t);
    await addWish(db, parseWish({ name: 'كلية فقيه', city: 'جدة' })!, t);
    await addWish(db, parseWish({ name: 'كليه فقيه', system: 'sis.fakeeh.edu.sa' })!, t + DAY);
    const list = await readWishes(db);
    expect(list.map(w => [w.name, w.n])).toEqual([['كلية فقيه', 2], ['جامعة جدة', 1]]);
    expect(list[0]).toMatchObject({ city: 'جدة', system: 'sis.fakeeh.edu.sa', first_day: '2026-10-27', last_day: '2026-10-28' });
    // Nothing else is kept: the table has no column for who asked.
    const cols = db.sql.prepare('PRAGMA table_info(wishes)').all().map(c => (c as { name: string }).name);
    expect(cols.sort()).toEqual(['city', 'first_day', 'key', 'last_day', 'n', 'name', 'system']);
  });

  it('cannot be flooded with new names, and forgets colleges nobody asked for in two years', async () => {
    const db = sqliteDb();
    const t = Date.parse('2026-10-27T09:00:00Z');
    db.sql.exec('CREATE TABLE IF NOT EXISTS wishes (key TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL DEFAULT \'\', system TEXT NOT NULL DEFAULT \'\', n INTEGER NOT NULL DEFAULT 0, first_day TEXT NOT NULL, last_day TEXT NOT NULL)');
    const insert = db.sql.prepare('INSERT INTO wishes (key, name, n, first_day, last_day) VALUES (?, ?, 1, ?, ?)');
    for (let i = 0; i < MAX_WISHES; i++) insert.run(`college ${i}`, `College ${i}`, '2024-01-01', '2024-01-01');
    expect(await addWish(db, parseWish({ name: 'New College' })!, t)).toBe(false);
    // One already there is still counted.
    expect(await addWish(db, parseWish({ name: 'College 7' })!, t)).toBe(true);
    await purgeWishes(db, t);
    expect((await readWishes(db)).map(w => w.name)).toEqual(['College 7']);
  });
});

describe('over HTTP', () => {
  function deployed(extra: Partial<Env> = {}) {
    const env: Env = { IP_LIMIT: allow, ADMIN_KEY: KEY, STATS: sqliteDb(), ...extra };
    const wish = (body: unknown, headers: Record<string, string> = {}) => handleApi(new Request('http://x/api/v1/wish', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...SITE, ...headers }, body: JSON.stringify(body),
    }), env);
    const admin = (method = 'GET', body?: unknown) => handleApi(new Request('http://x/api/v1/admin/wishes', {
      method, headers: { ...SITE, Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    }), env);
    return { env, wish, admin };
  }

  it('a student asks; the owner reads the list and removes a row', async () => {
    const { wish, admin } = deployed();
    expect((await wish({ name: 'كلية فقيه', city: 'جدة' })).status).toBe(204);
    expect((await wish({ name: 'كلية فقيه' })).status).toBe(204);
    expect((await wish({ name: '' })).status).toBe(400);
    const { wishes } = await (await admin()).json() as { wishes: { key: string; name: string; n: number }[] };
    expect(wishes).toMatchObject([{ name: 'كلية فقيه', n: 2 }]);
    expect((await admin('DELETE', { key: wishes[0]!.key })).status).toBe(200);
    expect(await (await admin()).json()).toEqual({ wishes: [] });
  });

  it('only from the site, within the limit per address, and never without the protections', async () => {
    expect((await deployed().wish({ name: 'كلية فقيه' }, { Origin: 'https://evil.example' })).status).toBe(403);
    const no: RateLimit = { limit: async () => ({ success: false }) };
    expect((await deployed({ IP_LIMIT: no }).wish({ name: 'كلية فقيه' })).status).toBe(429);
    expect((await deployed({ IP_LIMIT: undefined }).wish({ name: 'كلية فقيه' })).status).toBe(503);
    expect((await deployed({ STATS: undefined }).wish({ name: 'كلية فقيه' })).status).toBe(503);
  });

  it('the list is the owner\'s alone', async () => {
    const { env } = deployed();
    const res = await handleApi(new Request('http://x/api/v1/admin/wishes', { headers: SITE }), env);
    expect(res.status).toBe(401);
  });
});
