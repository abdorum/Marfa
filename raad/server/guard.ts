// Abuse protection for Raad's server (Docs/09-security-privacy.md). The server
// signs in with whatever it is given, so without this anyone could use it to
// guess a student's password, lock their account, or get Raad blocked for everyone.
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

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Wrong passwords in a row before Raad stops trying for that ID. */
export const MAX_FAILURES = 5;
/** Kept by KV for this long after the last wrong password (seconds). */
export const LOCK_SECONDS = 15 * 60;

/** College IDs and passwords: anything else is refused before reaching the college. */
const USERID = /^[A-Za-z0-9._@-]{1,32}$/;
const MAX_PWD = 128;

/**
 * A request with no Origin (an installed app, curl) is judged by the limits
 * alone; a browser on any other site is refused here, and also by CORS, since
 * the server never answers a preflight.
 */
export const originAllowed = (origin: string | null) => !origin || SITE_ORIGINS.includes(origin) || DEV_ORIGIN.test(origin);

export const validCredentials = (userid: string, pwd: string) => USERID.test(userid) && pwd.length > 0 && pwd.length <= MAX_PWD;

/** The failure counter is keyed by a hash, so the store never holds a student ID. */
export async function idKey(userid: string): Promise<string> {
  // The "ties:" salt predates the rename; changing it would reset every counter for nothing.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ties:${userid.toLowerCase()}`));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function failures(store: Store | undefined, key: string): Promise<number> {
  return Number(await store?.get(`fail:${key}`).catch(() => null)) || 0;
}

export async function recordFailure(store: Store | undefined, key: string, count: number): Promise<void> {
  await store?.put(`fail:${key}`, String(count + 1), { expirationTtl: LOCK_SECONDS }).catch(() => undefined);
}

export async function clearFailures(store: Store | undefined, key: string, count: number): Promise<void> {
  if (count) await store?.delete(`fail:${key}`).catch(() => undefined);
}

/** True when the limit says no; a missing binding (dev, tests) never blocks. */
export async function limited(limit: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limit) return false;
  try {
    return !(await limit.limit({ key })).success;
  } catch {
    return false;
  }
}
