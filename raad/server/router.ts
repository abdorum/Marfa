// Raad's server: the whole API (/api/v1/*). Stateless: nothing is stored or
// logged except an error code. Shared by the Worker, the Pages Function and
// `npm run dev`.
//
//   GET  /api/v1/status   paused? the owner's announcement. Never reaches the college.
//   GET  /api/v1/health   can Raad reach the college system? Never signs in.
//   POST /api/v1/sync     sign in, read the allowed parts, sign out. Streams its steps
//                         as NDJSON when asked (Accept: application/x-ndjson).
//   POST /api/v1/metrics  anonymous statistics, when the student opted in.
import type { EdgeConnector, ServerEvent } from './connector';
import { EdgeError } from './connector';
import { CONNECTORS } from './connectors';
import { clearFailures, failures, idKey, limited, MAX_FAILURES, originAllowed, recordFailure, validCredentials, type RateLimit, type Store } from './guard';

const MAX_BODY = 4096;
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEADERS },
});

/**
 * Cloudflare bindings and variables, all optional so dev and tests run without them.
 * METRICS: Workers Analytics Engine. IP_LIMIT, ID_LIMIT: rate limiting.
 * GUARD: KV holding wrong-password counters (guard.ts).
 * RAAD_PAUSED = "1" stops every sync, with RAAD_MESSAGE_AR/EN as the reason.
 * NOTICE_AR/EN: an announcement every student sees.
 */
export interface Env {
  METRICS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void };
  IP_LIMIT?: RateLimit;
  ID_LIMIT?: RateLimit;
  GUARD?: Store;
  RAAD_PAUSED?: string;
  RAAD_MESSAGE_AR?: string;
  RAAD_MESSAGE_EN?: string;
  NOTICE_AR?: string;
  NOTICE_EN?: string;
}

/** Keeps a response's work alive after it is returned (the Worker's ctx). */
export interface ExecutionContext {
  waitUntil(p: Promise<unknown>): void;
}

const OUTCOMES = ['succeeded', 'failed', 'needs_input', 'cancelled'];
const ERROR_CODES = ['BAD_CREDENTIALS', 'SESSION_EXPIRED', 'NOT_AUTHORIZED', 'TIMEOUT', 'UPSTREAM', 'BLOCKED'];

const paused = (env: Env) => /^(1|true|yes)$/i.test(env.RAAD_PAUSED ?? '');
const localized = (ar?: string, en?: string) => (ar || en ? { ar: ar || undefined, en: en || undefined } : undefined);

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
  const errors = Array.isArray(body.errorClasses)
    ? [...new Set(body.errorClasses.map(e => String(e).split(':').pop()!).filter(e => ERROR_CODES.includes(e)))].slice(0, 5).sort().join(',')
    : '';
  if (!jobType || !outcome || attempts == null || resets == null || duration == null || !version) return json(400, { code: 'BAD_REQUEST' });
  env.METRICS?.writeDataPoint({ indexes: [jobType], blobs: [jobType, outcome, version, errors], doubles: [attempts, resets, duration] });
  return new Response(null, { status: 204 });
}

export async function handleApi(request: Request, env: Env = {}, ctx?: ExecutionContext, connector: EdgeConnector = CONNECTORS[0]!): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');

  if (path === '/api/v1/status' && request.method === 'GET') {
    return json(200, {
      paused: paused(env),
      message: paused(env) ? localized(env.RAAD_MESSAGE_AR, env.RAAD_MESSAGE_EN) : undefined,
      notice: localized(env.NOTICE_AR, env.NOTICE_EN),
    });
  }
  if (path === '/api/v1/health' && request.method === 'GET') return json(200, await connector.health());
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

  // The owner's switch: nothing reaches the college while Raad is paused.
  if (paused(env)) return json(503, { code: 'PAUSED', message: localized(env.RAAD_MESSAGE_AR, env.RAAD_MESSAGE_EN) });

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
  const parts = Array.isArray(body.pages)
    ? body.pages.filter((p): p is string => typeof p === 'string' && connector.parts.includes(p))
    : [...connector.parts];

  // Before anything reaches the college: one device and one ID can only ask so often,
  // and an ID with too many wrong passwords rests (protects its account from lockout).
  const id = await idKey(userid);
  if (await limited(env.IP_LIMIT, request.headers.get('CF-Connecting-IP') ?? 'unknown') || await limited(env.ID_LIMIT, id)) {
    return json(429, { code: 'RATE_LIMITED' });
  }
  const failed = await failures(env.GUARD, id);
  if (failed >= MAX_FAILURES) return json(429, { code: 'LOCKED' });

  /** The whole sync, ending in an HTTP status and body; `emit` sees each step. */
  const run = async (emit: (e: ServerEvent) => void): Promise<[number, unknown]> => {
    try {
      const out = await connector.sync(userid, pwd, parts, emit);
      await clearFailures(env.GUARD, id, failed);
      return [200, out];
    } catch (e) {
      if (e instanceof EdgeError && e.code === 'BAD_CREDENTIALS') await recordFailure(env.GUARD, id, failed);
      // `detail` is a safe trace (statuses, paths, cookie names), never credentials or values.
      if (e instanceof EdgeError) return [e.code === 'BAD_CREDENTIALS' ? 401 : 502, { code: e.code, detail: e.message !== e.code ? e.message : undefined }];
      console.error('sync failed:', (e as Error).message);
      return [500, { code: 'SERVER_ERROR' }];
    }
  };

  if (!/application\/x-ndjson/i.test(request.headers.get('Accept') ?? '')) {
    const [status, out] = await run(() => {});
    return json(status, out);
  }

  // Streaming: one JSON line per step, then {"t":"done"} with what the plain
  // response would have carried. The HTTP status is 200 once streaming starts.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (line: unknown) => writer.write(encoder.encode(`${JSON.stringify(line)}\n`)).catch(() => {});
  const work = (async () => {
    const [status, out] = await run(e => void send({ t: 'step', ...e }));
    await send({ t: 'done', status, body: out });
    await writer.close().catch(() => {});
  })();
  ctx?.waitUntil(work);
  return new Response(readable, {
    status: 200,
    // no-transform: no compression that would hold lines back.
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', ...HEADERS, 'Cache-Control': 'no-store, no-transform' },
  });
}
