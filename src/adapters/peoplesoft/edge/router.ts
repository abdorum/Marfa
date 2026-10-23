// The whole edge API (/api/v1/*). Stateless: nothing is stored or logged
// except an error code. Shared by the Cloudflare Function and `npm run dev`.
import { PAGE_KEYS, isPageKey } from '../pages';
import { PS_BASE, PS_SITE } from '../pages';
import { clearFailures, failures, idKey, limited, MAX_FAILURES, originAllowed, recordFailure, validCredentials, type RateLimit, type Store } from './guard';
import { PsError, USER_AGENT } from './session';
import { syncPages } from './sync';

const MAX_BODY = 4096;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

/**
 * Cloudflare bindings, all optional so dev and tests run without them.
 * METRICS: Workers Analytics Engine. IP_LIMIT, ID_LIMIT: rate limiting.
 * GUARD: KV holding wrong-password counters (guard.ts).
 */
export interface Env {
  METRICS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void };
  IP_LIMIT?: RateLimit;
  ID_LIMIT?: RateLimit;
  GUARD?: Store;
}

const OUTCOMES = ['succeeded', 'failed', 'needs_input', 'cancelled'];
const ERROR_CODES = ['BAD_CREDENTIALS', 'SESSION_EXPIRED', 'NOT_AUTHORIZED', 'TIMEOUT', 'UPSTREAM'];

/**
 * Anonymous Raad statistics (ADR-014). Only whitelisted, bounded fields are
 * kept; anything else in the body is ignored. No ID, no IP.
 */
function metrics(body: Record<string, unknown>, env: Env): Response {
  const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : undefined);
  const jobType = body.jobType === 'sync' ? 'sync' : undefined;
  const outcome = OUTCOMES.includes(String(body.outcome)) ? String(body.outcome) : undefined;
  const attempts = int(body.attempts, 20);
  const resets = int(body.sessionResets, 20);
  const duration = int(body.durationMs, 600_000);
  const version = /^\d+\.\d+\.\d+$/.test(String(body.appVersion)) ? String(body.appVersion) : undefined;
  const errors = Array.isArray(body.errorClasses) ? body.errorClasses.filter(e => ERROR_CODES.includes(String(e))).slice(0, 5).sort().join(',') : '';
  if (!jobType || !outcome || attempts == null || resets == null || duration == null || !version) return json(400, { code: 'BAD_REQUEST' });
  env.METRICS?.writeDataPoint({ indexes: [jobType], blobs: [jobType, outcome, version, errors], doubles: [attempts, resets, duration] });
  return new Response(null, { status: 204 });
}

export async function handleApi(request: Request, env: Env = {}): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  // Can this server reach the college system? Opens the sign-in page only; never signs in.
  if (path === '/api/v1/health' && request.method === 'GET') {
    try {
      const res = await fetch(`${PS_BASE}/psp/${PS_SITE}/?cmd=login&languageCd=ENG&`, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' });
      // Who refused: the sign-in page holds no personal data, so its start is safe to show.
      const said = res.status === 200 ? undefined : (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
      const by = ['server', 'x-oracle-dms-ecid', 'x-azure-ref', 'x-cache', 'via'].filter(h => res.headers.has(h));
      return json(200, { sis: res.status, reachable: res.status === 200, said, by });
    } catch (e) {
      return json(200, { sis: 0, reachable: false, error: (e as Error).name });
    }
  }
  if (path !== '/api/v1/sync' && path !== '/api/v1/metrics') return json(404, { code: 'NOT_FOUND' });
  if (request.method !== 'POST') return json(405, { code: 'METHOD' });
  if (!originAllowed(request.headers.get('Origin'))) return json(403, { code: 'FORBIDDEN' });
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) return json(415, { code: 'BAD_REQUEST' });
  if (path === '/api/v1/metrics') {
    try {
      const text = await request.text();
      return text.length > 1024 ? json(413, { code: 'BAD_REQUEST' }) : metrics(JSON.parse(text), env);
    } catch {
      return json(400, { code: 'BAD_REQUEST' });
    }
  }

  let body: { userid?: unknown; pwd?: unknown; pages?: unknown };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { code: 'BAD_REQUEST' });
    body = JSON.parse(text || '{}');
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  const userid = String(body.userid ?? '').trim();
  const pwd = String(body.pwd ?? '');
  if (!validCredentials(userid, pwd)) return json(400, { code: 'BAD_REQUEST' });
  const pages = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === 'string').filter(isPageKey) : PAGE_KEYS;

  // Before anything reaches the college: one device and one ID can only ask so often,
  // and an ID with too many wrong passwords rests (protects its account from lockout).
  const id = await idKey(userid);
  if (await limited(env.IP_LIMIT, request.headers.get('CF-Connecting-IP') ?? 'unknown') || await limited(env.ID_LIMIT, id)) {
    return json(429, { code: 'RATE_LIMITED' });
  }
  const failed = await failures(env.GUARD, id);
  if (failed >= MAX_FAILURES) return json(429, { code: 'LOCKED' });

  try {
    const out = await syncPages(userid, pwd, pages);
    await clearFailures(env.GUARD, id, failed);
    return json(200, out);
  } catch (e) {
    if (e instanceof PsError && e.code === 'BAD_CREDENTIALS') await recordFailure(env.GUARD, id, failed);
    // `detail` is a safe trace (statuses, paths, cookie names), never credentials or values.
    if (e instanceof PsError) return json(e.code === 'BAD_CREDENTIALS' ? 401 : 502, { code: e.code, detail: e.message !== e.code ? e.message : undefined });
    console.error('sync failed:', (e as Error).message);
    return json(500, { code: 'SERVER_ERROR' });
  }
}
