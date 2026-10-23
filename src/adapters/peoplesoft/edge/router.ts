// The whole edge API (/api/v1/*). Stateless: nothing is stored or logged
// except an error code. Shared by the Cloudflare Function and `npm run dev`.
import { PAGE_KEYS, isPageKey } from '../pages';
import { PsError } from './session';
import { syncPages } from './sync';

const MAX_BODY = 4096;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

/** Cloudflare bindings. METRICS is a Workers Analytics Engine dataset (optional). */
export interface Env {
  METRICS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void };
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
  if (path !== '/api/v1/sync' && path !== '/api/v1/metrics') return json(404, { code: 'NOT_FOUND' });
  if (request.method !== 'POST') return json(405, { code: 'METHOD' });
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
  if (!userid || !pwd) return json(400, { code: 'BAD_REQUEST' });
  const pages = Array.isArray(body.pages) ? body.pages.filter((p): p is string => typeof p === 'string').filter(isPageKey) : PAGE_KEYS;

  try {
    return json(200, await syncPages(userid, pwd, pages));
  } catch (e) {
    if (e instanceof PsError) return json(e.code === 'BAD_CREDENTIALS' ? 401 : 502, { code: e.code });
    console.error('sync failed:', (e as Error).message);
    return json(500, { code: 'SERVER_ERROR' });
  }
}
