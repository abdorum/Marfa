// Abuse protection for Raad's server (Docs/09-security-privacy.md). The server
// signs in with whatever it is given, so without this anyone could use it to
// guess a student's password, lock their account, or get Raad blocked for
// everyone. Every check fails closed: when a protection cannot run, the sync
// is refused, never let through.
import { SITE_ORIGINS } from './config';

/** Cloudflare Workers rate limiting binding. */
export interface RateLimit {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

/** The part of a Workers KV namespace the guard uses. */
export interface Store {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, o?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** A protection could not run; the request is refused (503). */
export class GuardUnavailable extends Error {
  constructor(what: string) {
    super(what);
    this.name = 'GuardUnavailable';
  }
}

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Wrong passwords in a row before Raad stops trying for that ID (PeopleSoft's own limit is unknown, so it stays low). */
export const MAX_FAILURES = 3;
/** Kept by KV for this long after the last wrong password (seconds). */
export const LOCK_SECONDS = 15 * 60;

/** College IDs and passwords: anything else is refused before reaching the college. */
const USERID = /^[A-Za-z0-9._@-]{1,32}$/;
const MAX_PWD = 128;

/**
 * Only the site itself may post: a browser always sends Origin with a POST,
 * and Sec-Fetch-Site, when sent, must say the call came from the same site.
 * Neither stops a script that forges them; the limits below do that. They
 * stop other websites from using a visitor's browser against Raad.
 */
export function requestAllowed(headers: Headers): boolean {
  const origin = headers.get('Origin');
  if (!origin || !(SITE_ORIGINS.includes(origin) || DEV_ORIGIN.test(origin))) return false;
  const site = headers.get('Sec-Fetch-Site');
  return !site || site === 'same-origin';
}

export const validCredentials = (userid: string, pwd: string) => USERID.test(userid) && pwd.length > 0 && pwd.length <= MAX_PWD;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);

/**
 * The counters are keyed by a pseudonym of the ID: an HMAC under a secret only
 * the Worker holds (ID_KEY), so whoever reads the store cannot recover an ID by
 * trying them all. Without the secret (dev, tests) a plain hash stands in.
 */
export async function idKey(userid: string, secret?: string): Promise<string> {
  const data = new TextEncoder().encode(userid.toLowerCase());
  if (!secret) return hex(await crypto.subtle.digest('SHA-256', data));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, data));
}

export async function failures(store: Store | undefined, key: string): Promise<number> {
  if (!store) return 0;
  try {
    return Number(await store.get(`fail:${key}`)) || 0;
  } catch {
    throw new GuardUnavailable('GUARD');
  }
}

/** Counts one more wrong password, from the newest count, not the one read before signing in. */
export async function recordFailure(store: Store | undefined, key: string): Promise<void> {
  if (!store) return;
  const now = await failures(store, key);
  await store.put(`fail:${key}`, String(now + 1), { expirationTtl: LOCK_SECONDS }).catch(() => undefined);
}

export async function clearFailures(store: Store | undefined, key: string, count: number): Promise<void> {
  if (count) await store?.delete(`fail:${key}`).catch(() => undefined);
}

/** True when the limit says no. A missing binding never blocks (dev, tests); a failing one refuses. */
export async function limited(limit: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limit) return false;
  try {
    return !(await limit.limit({ key })).success;
  } catch {
    throw new GuardUnavailable('LIMIT');
  }
}

/**
 * IDs syncing right now in this instance: one sync per ID at a time, so
 * parallel requests cannot race past the wrong-password count. (Two instances
 * may still each run one; the per-ID rate limit bounds that.)
 */
const inFlight = new Set<string>();

export function claim(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export const release = (key: string) => void inFlight.delete(key);

// ── The circuit breaker ───────────────────────────────────────────────────
// When the college is struggling or refuses Raad, Raad rests for everyone
// instead of adding to the load. The rest is kept in KV so every instance sees it.

export interface Cooldown {
  /** ISO time the rest ends. */
  until: string;
  reason: 'BLOCKED' | 'UPSTREAM';
}

/** Rest after the college firewall refused Raad (403): an hour. */
export const BLOCKED_REST_S = 60 * 60;
/** Rest after repeated college errors: five minutes. */
export const UPSTREAM_REST_S = 5 * 60;
const UPSTREAM_TRIP = 5;
const UPSTREAM_WINDOW_MS = 60_000;

export async function cooldown(store: Store | undefined, now = Date.now()): Promise<Cooldown | undefined> {
  if (!store) return undefined;
  let raw: string | null;
  try {
    raw = await store.get('cooldown');
  } catch {
    throw new GuardUnavailable('GUARD');
  }
  if (!raw) return undefined;
  try {
    const c = JSON.parse(raw) as Cooldown;
    return Date.parse(c.until) > now ? c : undefined;
  } catch {
    return undefined;
  }
}

export async function startCooldown(store: Store | undefined, reason: Cooldown['reason'], seconds: number, now = Date.now()): Promise<void> {
  const c: Cooldown = { until: new Date(now + seconds * 1000).toISOString(), reason };
  // KV keeps a key at least 60 seconds.
  await store?.put('cooldown', JSON.stringify(c), { expirationTtl: Math.max(60, seconds) }).catch(() => undefined);
}

const upstreamFailures: number[] = [];

/** Notes a college error; true when there were enough of them lately to rest. */
export function upstreamFailed(now = Date.now()): boolean {
  upstreamFailures.push(now);
  while (upstreamFailures.length && upstreamFailures[0]! < now - UPSTREAM_WINDOW_MS) upstreamFailures.shift();
  if (upstreamFailures.length < UPSTREAM_TRIP) return false;
  upstreamFailures.length = 0;
  return true;
}

/** Tests only: forget what this instance remembers. */
export function resetGuardMemory() {
  inFlight.clear();
  upstreamFailures.length = 0;
}
