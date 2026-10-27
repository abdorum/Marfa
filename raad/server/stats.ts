// The owner's statistics (/admin/): how many students use the portal, and how
// Raad fares, day by day. Kept in D1 (the STATS binding), never in a log.
// A student is known here only by a pseudonym of the ID (an HMAC under ID_KEY,
// as guard.ts keys its counters), with the first and last day of use. It goes
// when the student signs out, or a year after the last use. Everything else is
// a count per day that points to no one (Docs/09-security-privacy.md).
import { INSTITUTION } from '../../src/institutions';
import { idKey } from './guard';

/** The part of a D1 database the statistics use. */
export interface Db {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ results?: unknown[] }[]>;
}

export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

/** Keeps a response's work alive after it is returned (the Worker's ctx.waitUntil). */
export type Wait = (p: Promise<unknown>) => void;

/**
 * What a count counts, and its keys: an outcome code (OK, PARTIAL, a failure,
 * or a refusal before the college); an hour, 00 to 23; a part that failed with
 * its code ("attendance:TIMEOUT"); the version of the app that opened.
 */
export type Kind = 'outcome' | 'hour' | 'part' | 'open';

export interface StatsReport {
  /** The institution's calendar day now, and the first day reported. */
  today: string;
  from: string;
  /** Students with a pseudonym: all of them, and those seen in the last 7 and 30 days. */
  students: { total: number; week: number; month: number };
  days: { day: string; students: number; new: number }[];
  counts: { day: string; kind: Kind; what: string; n: number; ms: number }[];
}

const DAY_MS = 86_400_000;
const OFFSET_MS = INSTITUTION.timeZone.offsetMinutes * 60_000;

/** The institution's calendar day of a moment, as YYYY-MM-DD. */
export const dayOf = (t: number) => new Date(t + OFFSET_MS).toISOString().slice(0, 10);
export const hourOf = (t: number) => new Date(t + OFFSET_MS).getUTCHours();
const daysBefore = (t: number, n: number) => dayOf(t - n * DAY_MS);

/** A pseudonym is deleted this long after the student's last use. */
export const KEEP_STUDENT_DAYS = 365;
/** Daily counts are deleted this long after their day. */
export const KEEP_COUNT_DAYS = 730;
/** The days the owner's page shows. */
export const REPORT_DAYS = 30;

/** The student's pseudonym here: like the wrong-password counters', under its own prefix, so the two never match. */
export const pseudonym = (userid: string, secret?: string) => idKey(`stats:${userid}`, secret);

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS students (who TEXT PRIMARY KEY, first_day TEXT NOT NULL, last_day TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS students_by_last_day ON students (last_day)',
  'CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, students INTEGER NOT NULL DEFAULT 0, new INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, kind TEXT NOT NULL, what TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, what))',
];

// A row comes back only when the student is new, or new today: the first
// sync of the day moves last_day, and later ones change nothing.
const SEEN = `INSERT INTO students (who, first_day, last_day) VALUES (?, ?, ?)
  ON CONFLICT (who) DO UPDATE SET last_day = excluded.last_day WHERE students.last_day < excluded.last_day
  RETURNING first_day`;
const SEEN_DAY = `INSERT INTO days (day, students, new) VALUES (?, 1, ?)
  ON CONFLICT (day) DO UPDATE SET students = students + 1, new = new + excluded.new`;
const COUNT = `INSERT INTO counts (day, kind, what, n, ms) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (day, kind, what) DO UPDATE SET n = n + excluded.n, ms = ms + excluded.ms`;

// The tables are made by the Worker itself, once per instance: nothing to
// run by hand when the database is new.
let schema: Promise<unknown> | undefined;
const ready = (db: Db) => (schema ??= db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => {
  schema = undefined;
  throw e;
}));

interface Pending { day: string; kind: Kind; what: string; n: number; ms: number }
const pending = new Map<string, Pending>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushAfterMs = 10_000;

/**
 * Counts one event. Counts wait a few seconds in memory and are written
 * together, so a burst, or someone hammering Raad, costs one write.
 */
export function count(db: Db | undefined, wait: Wait | undefined, kind: Kind, what: string, ms = 0, now = Date.now()) {
  if (!db) return;
  const day = dayOf(now);
  const id = `${day} ${kind} ${what}`;
  let p = pending.get(id);
  if (!p) pending.set(id, (p = { day, kind, what, n: 0, ms: 0 }));
  p.n += 1;
  p.ms += Math.max(0, Math.round(ms));
  if (timer) return;
  wait?.(new Promise<void>(resolve => {
    timer = setTimeout(() => {
      timer = undefined;
      void flushCounts(db).finally(resolve);
    }, flushAfterMs);
  }));
}

/** One sync that reached the college: its outcome and duration, its hour, and the parts that failed. */
export function countSync(db: Db | undefined, wait: Wait | undefined, code: string, ms: number, failed: Record<string, string> = {}, now = Date.now()) {
  count(db, wait, 'outcome', code, ms, now);
  count(db, wait, 'hour', String(hourOf(now)).padStart(2, '0'), 0, now);
  for (const [part, why] of Object.entries(failed)) count(db, wait, 'part', `${part}:${why}`, 0, now);
}

/** Writes the counts waiting in memory. */
export async function flushCounts(db: Db): Promise<void> {
  if (!pending.size) return;
  const rows = [...pending.values()];
  pending.clear();
  try {
    await ready(db);
    await db.batch(rows.map(p => db.prepare(COUNT).bind(p.day, p.kind, p.what, p.n, p.ms)));
  } catch {
    // Lost: statistics never break anything, nor pile up in memory.
  }
}

/** A student signed in: counted once a day, and as new the first time. */
export async function seen(db: Db | undefined, who: string, now = Date.now()): Promise<void> {
  if (!db) return;
  const day = dayOf(now);
  try {
    await ready(db);
    const row = await db.prepare(SEEN).bind(who, day, day).first<{ first_day: string }>();
    if (row) await db.prepare(SEEN_DAY).bind(day, row.first_day === day ? 1 : 0).run();
  } catch {
    // Statistics never break a sync.
  }
}

/** The student signed out: their pseudonym leaves. The day's counts stay, since they point to no one. */
export async function forget(db: Db, who: string): Promise<void> {
  await ready(db);
  await db.prepare('DELETE FROM students WHERE who = ?').bind(who).run();
}

/** Daily: pseudonyms unused for a year, and counts two years old. */
export async function purge(db: Db, now = Date.now()): Promise<void> {
  await ready(db);
  const counts = daysBefore(now, KEEP_COUNT_DAYS);
  await db.batch([
    db.prepare('DELETE FROM students WHERE last_day < ?').bind(daysBefore(now, KEEP_STUDENT_DAYS)),
    db.prepare('DELETE FROM days WHERE day < ?').bind(counts),
    db.prepare('DELETE FROM counts WHERE day < ?').bind(counts),
  ]);
}

/** The last REPORT_DAYS days, for the owner's page. */
export async function readStats(db: Db, now = Date.now()): Promise<StatsReport> {
  await flushCounts(db);
  await ready(db);
  const today = dayOf(now);
  const from = daysBefore(now, REPORT_DAYS - 1);
  const week = daysBefore(now, 6);
  const [total, inWeek, inMonth, days, counts] = await db.batch([
    db.prepare('SELECT count(*) AS n FROM students'),
    db.prepare('SELECT count(*) AS n FROM students WHERE last_day >= ?').bind(week),
    db.prepare('SELECT count(*) AS n FROM students WHERE last_day >= ?').bind(from),
    db.prepare('SELECT day, students, new FROM days WHERE day >= ? ORDER BY day').bind(from),
    db.prepare('SELECT day, kind, what, n, ms FROM counts WHERE day >= ? ORDER BY day').bind(from),
  ]);
  const n = (r?: { results?: unknown[] }) => Number((r?.results?.[0] as { n?: number } | undefined)?.n ?? 0);
  return {
    today,
    from,
    students: { total: n(total), week: n(inWeek), month: n(inMonth) },
    days: (days?.results ?? []) as StatsReport['days'],
    counts: (counts?.results ?? []) as StatsReport['counts'],
  };
}

/** Tests only: forget what this instance remembers; counts are written after `flushAfter` ms. */
export function resetStatsMemory(flushAfter = 10_000) {
  clearTimeout(timer);
  timer = undefined;
  pending.clear();
  schema = undefined;
  flushAfterMs = flushAfter;
}
