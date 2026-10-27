// Colleges students asked for (POST /api/v1/wish): a student whose college is
// not in the portal names it, so the owner sees which to build next. Kept in
// the statistics' D1, one row per college: its name as first written, the
// latest city and system address given, how many asked, and the first and last
// day. No ID, no address, nothing that points to the student who asked.
import { dayOf, KEEP_COUNT_DAYS, type Db } from './stats';

export interface Wish {
  key: string;
  name: string;
  city: string;
  /** The host of the college's student system, when the student knew it. */
  system: string;
  n: number;
  first_day: string;
  last_day: string;
}

export const MAX_NAME = 80;
export const MAX_CITY = 40;
/** Colleges kept at most: past this, a new name is refused, so the table cannot be flooded. */
export const MAX_WISHES = 500;
/** The colleges the owner's page shows, most asked first. */
export const REPORT_WISHES = 100;

const SCHEMA = 'CREATE TABLE IF NOT EXISTS wishes (key TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL DEFAULT \'\', system TEXT NOT NULL DEFAULT \'\', n INTEGER NOT NULL DEFAULT 0, first_day TEXT NOT NULL, last_day TEXT NOT NULL)';
const ADD = `INSERT INTO wishes (key, name, city, system, n, first_day, last_day) VALUES (?, ?, ?, ?, 1, ?, ?)
  ON CONFLICT (key) DO UPDATE SET n = n + 1, last_day = excluded.last_day,
    city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE wishes.city END,
    system = CASE WHEN excluded.system <> '' THEN excluded.system ELSE wishes.system END`;

let schema: Promise<unknown> | undefined;
const ready = (db: Db) => (schema ??= db.prepare(SCHEMA).run().catch(e => {
  schema = undefined;
  throw e;
}));

/** Plain text on one line: no controls, no marks of direction, spaces collapsed. */
const clean = (v: unknown, max: number) => String(v ?? '')
  .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/**
 * The same college however it is written: no diacritics or tatweel, one form
 * of alef, ya and ta marbuta, Latin in lower case, and no leading "كلية",
 * "جامعة", "the", "college of" or "university of".
 */
export function wishKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(?:ال)?(?:كليه|جامعه)\s+/, '')
    .replace(/^(?:the\s+)?(?:(?:college|university)\s+of\s+)?/, '')
    .trim();
}

/** The host of a system address the student gave ("sis.example.edu"), or empty. */
export function systemHost(v: unknown): string {
  const s = String(v ?? '').trim().slice(0, 200);
  if (!s) return '';
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase();
    return /^(?=.{4,100}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : '';
  } catch {
    return '';
  }
}

/** A request read from a body, or undefined when its name is missing. */
export function parseWish(body: Record<string, unknown>): { key: string; name: string; city: string; system: string } | undefined {
  const name = clean(body.name, MAX_NAME);
  const key = wishKey(name);
  if (key.length < 2) return undefined;
  return { key, name, city: clean(body.city, MAX_CITY), system: systemHost(body.system) };
}

/** Counts one request. False when the table is full and the college is new. */
export async function addWish(db: Db, w: { key: string; name: string; city: string; system: string }, now = Date.now()): Promise<boolean> {
  await ready(db);
  const day = dayOf(now);
  const known = await db.prepare('SELECT 1 AS x FROM wishes WHERE key = ?').bind(w.key).first();
  if (!known) {
    const rows = await db.prepare('SELECT count(*) AS n FROM wishes').first<{ n: number }>();
    if (Number(rows?.n ?? 0) >= MAX_WISHES) return false;
  }
  await db.prepare(ADD).bind(w.key, w.name, w.city, w.system, day, day).run();
  return true;
}

/** The colleges asked for, most asked first, for the owner's page. */
export async function readWishes(db: Db): Promise<Wish[]> {
  await ready(db);
  const { results } = await db.prepare('SELECT key, name, city, system, n, first_day, last_day FROM wishes ORDER BY n DESC, last_day DESC LIMIT ?').bind(REPORT_WISHES).all<Wish>();
  return results;
}

/** The owner removes a row: a joke, or a college now in the portal. */
export async function removeWish(db: Db, key: string): Promise<void> {
  await ready(db);
  await db.prepare('DELETE FROM wishes WHERE key = ?').bind(key).run();
}

/** Daily: colleges nobody asked for in two years. */
export async function purgeWishes(db: Db, now = Date.now()): Promise<void> {
  await ready(db);
  await db.prepare('DELETE FROM wishes WHERE last_day < ?').bind(dayOf(now - KEEP_COUNT_DAYS * 86_400_000)).run();
}

/** Tests only. */
export const resetWishesMemory = () => { schema = undefined; };
