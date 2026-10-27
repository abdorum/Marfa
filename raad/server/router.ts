// Raad's server: the whole API (/api/v1/*). No request or reply is stored or
// logged. The owner's statistics keep counts per day and, for each student who
// signed in, a pseudonym with the first and last day of use (stats.ts).
// Shared by the Worker, the Pages Function and `npm run dev`.
//
//   GET  /api/v1/status   paused or resting? the owner's announcement. Never reaches the college.
//   GET  /api/v1/health   can Raad reach the college system? Never signs in; answered once a minute at most.
//   POST /api/v1/sync     sign in, read the allowed parts, sign out. Streams its steps
//                         as NDJSON when asked (Accept: application/x-ndjson).
//   POST /api/v1/forget   the student signed out: their pseudonym leaves the statistics.
//   POST /api/v1/metrics  anonymous statistics, when the student opted in.
//   POST /api/v1/wish     a college not in the portal yet, for the owner to build next (wishes.ts).
//   *    /api/v1/admin/*  the owner's page, with the owner's key (admin.ts).
import { handleAdmin } from './admin';
import type { EdgeConnector, ServerEvent } from './connector';
import { EdgeError } from './connector';
import { CONNECTORS } from './connectors';
import { RAAD_VERSION } from './config';
import {
  BLOCKED_REST_S, claim, clearFailures, cooldown, failures, GuardUnavailable, idKey, limited, MAX_FAILURES, recordFailure,
  release, requestAllowed, startCooldown, upstreamFailed, UPSTREAM_REST_S, validCredentials, validUserid, type RateLimit, type Store,
} from './guard';
import { clientIp, HEADERS, json, MAX_BODY, readJson } from './http';
import { count, countSync, forget, pseudonym, seen, type Db, type Wait } from './stats';
import { combine, dashboardSwitches, readSwitches, type SwitchVars } from './switches';
import { addWish, parseWish } from './wishes';

const HEALTH_CACHE_MS = 60_000;

/** Workers Analytics Engine: rows of codes and counts, never an ID or an address. */
interface Metrics {
  writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

/**
 * Cloudflare bindings and variables.
 * - METRICS: Workers Analytics Engine, for the statistics devices send when their student opted in.
 * - IP_LIMIT, ID_LIMIT, GLOBAL_LIMIT: rate limiting.
 * - GUARD: KV holding wrong-password counters, Raad's rest and the owner's switches (guard.ts, switches.ts).
 *   ID_KEY: the secret behind every pseudonym.
 * - STATS: D1, the owner's statistics (stats.ts). ADMIN_KEY: the owner's key to the owner's page (admin.ts).
 * - RAAD_PAUSED = "1" stops every sync, with RAAD_MESSAGE_AR/EN as the reason.
 * - NOTICE_AR/EN: an announcement every student sees.
 * - RAAD_DISABLE_PAGES: parts never to read, comma-separated ("attendance"), e.g. a page that began to end sessions.
 * - RAAD_STALE_MINUTES: how old data may get before devices refresh it on their own (exam weeks: raise it).
 *   These four are the dashboard's way to the switches the owner's page sets (switches.ts).
 * - RAAD_DEV = "1": dev and tests, where the protections may be missing. Anywhere else a missing one refuses every sync.
 */
export interface Env extends SwitchVars {
  METRICS?: Metrics;
  IP_LIMIT?: RateLimit;
  ID_LIMIT?: RateLimit;
  GLOBAL_LIMIT?: RateLimit;
  GUARD?: Store;
  ID_KEY?: string;
  STATS?: Db;
  ADMIN_KEY?: string;
  RAAD_DEV?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string };
}

/** Keeps a response's work alive after it is returned (the Worker's ctx). */
export interface ExecutionContext {
  waitUntil(p: Promise<unknown>): void;
}

const OUTCOMES = ['succeeded', 'failed', 'needs_input', 'cancelled'];
const ERROR_CODES = ['BAD_CREDENTIALS', 'ACCOUNT', 'SESSION_EXPIRED', 'NOT_AUTHORIZED', 'TIMEOUT', 'UPSTREAM', 'BLOCKED'];
const COLLEGE_TROUBLE = ['UPSTREAM', 'TIMEOUT'];

const dev = (env: Env) => env.RAAD_DEV === '1';

/**
 * Which app opened, from the header it sends with its status check: this
 * version, an older one, or unknown (apps before 1.3 send none). Never more,
 * so the counts cannot be flooded with made-up versions.
 */
function appVersion(request: Request): string {
  const v = request.headers.get('X-Taleeb-App') ?? '';
  if (v === RAAD_VERSION) return v;
  const parts = (s: string) => s.split('.').map(Number);
  const [a, b] = [parts(v), parts(RAAD_VERSION)];
  const older = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v) && (a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!) < 0;
  return older ? 'older' : 'unknown';
}

/**
 * Anonymous Raad statistics a device sends (ADR-014). Only whitelisted, bounded
 * fields are kept; anything else in the body is ignored. No ID, no IP.
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

/** The student signed out: their pseudonym leaves the statistics. The same answer whether there was one or not. */
async function forgetStudent(request: Request, env: Env): Promise<Response> {
  const read = await readJson(request);
  if ('refused' in read) return read.refused;
  const userid = String(read.body.userid ?? '').trim();
  if (!validUserid(userid)) return json(400, { code: 'BAD_REQUEST' });
  if (await limited(env.IP_LIMIT, `forget:${clientIp(request)}`)) return json(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '60' });
  if (env.STATS) await forget(env.STATS, await pseudonym(userid, env.ID_KEY)).catch(() => undefined);
  return new Response(null, { status: 204, headers: HEADERS });
}

/** A college a student asked for. The same answer whether it was new or not; no ID or address is kept. */
async function wish(request: Request, env: Env): Promise<Response> {
  const read = await readJson(request);
  if ('refused' in read) return read.refused;
  const w = parseWish(read.body);
  if (!w) return json(400, { code: 'BAD_REQUEST' });
  if (!env.STATS || (!dev(env) && !env.IP_LIMIT)) return json(503, { code: 'UNAVAILABLE' });
  if (await limited(env.IP_LIMIT, `wish:${clientIp(request)}`)) return json(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '60' });
  return (await addWish(env.STATS, w)) ? new Response(null, { status: 204, headers: HEADERS }) : json(507, { code: 'FULL' });
}

let health: { at: number; body: Record<string, unknown> } | undefined;

export async function handleApi(request: Request, env: Env = {}, ctx?: ExecutionContext, connector: EdgeConnector = CONNECTORS[0]!): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  try {
    return await route(path, request, env, ctx, connector);
  } catch (e) {
    if (e instanceof GuardUnavailable) return json(503, { code: 'UNAVAILABLE' });
    // Only the error's kind: a message could carry what the college said.
    console.error('raad failed:', (e as Error).name);
    return json(500, { code: 'SERVER_ERROR' });
  }
}

async function route(path: string, request: Request, env: Env, ctx: ExecutionContext | undefined, connector: EdgeConnector): Promise<Response> {
  const wait: Wait | undefined = ctx ? p => ctx.waitUntil(p) : undefined;
  if (path === '/api/v1/status' && request.method === 'GET') {
    count(env.STATS, wait, 'open', appVersion(request));
    const s = combine(await readSwitches(env.GUARD).catch(() => ({})), dashboardSwitches(env));
    const rest = s.paused ? undefined : await cooldown(env.GUARD).catch(() => undefined);
    return json(200, {
      paused: s.paused || !!rest,
      auto: rest ? true : undefined,
      until: rest?.until,
      message: s.message,
      notice: s.notice,
      staleMinutes: s.staleMinutes,
      version: RAAD_VERSION,
      build: env.CF_VERSION_METADATA?.id?.slice(0, 8),
    });
  }
  if (path === '/api/v1/health' && request.method === 'GET') {
    // Every call reaches the college, so the answer is kept a minute.
    if (!health || Date.now() - health.at > HEALTH_CACHE_MS) health = { at: Date.now(), body: await connector.health() };
    return json(200, health.body);
  }
  if (path.startsWith('/api/v1/admin/')) return handleAdmin(path, request, env, connector);
  if (!['/api/v1/sync', '/api/v1/metrics', '/api/v1/forget', '/api/v1/wish'].includes(path)) return json(404, { code: 'NOT_FOUND' });
  if (request.method !== 'POST') return json(405, { code: 'METHOD' });
  if (!requestAllowed(request.headers)) return json(403, { code: 'FORBIDDEN' });
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) return json(415, { code: 'BAD_REQUEST' });
  // A body that says it is too big is refused before it is read.
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return json(413, { code: 'BAD_REQUEST' });
  if (path === '/api/v1/metrics') {
    try {
      const text = await request.text();
      return text.length > 1024 ? json(413, { code: 'BAD_REQUEST' }) : metrics(JSON.parse(text), env);
    } catch {
      return json(400, { code: 'BAD_REQUEST' });
    }
  }
  if (path === '/api/v1/forget') return forgetStudent(request, env);
  if (path === '/api/v1/wish') return wish(request, env);

  /** A sync refused before it reached the college, counted by its code. */
  const refuse = (status: number, body: { code: string } & Record<string, unknown>, extra?: Record<string, string>) => {
    count(env.STATS, wait, 'outcome', body.code);
    return json(status, body, extra);
  };

  // The owner's switches: nothing reaches the college while Raad is paused.
  const s = combine(await readSwitches(env.GUARD), dashboardSwitches(env));
  if (s.paused) return refuse(503, { code: 'PAUSED', message: s.message });
  // A protection that is not there refuses, rather than letting the sync through unguarded.
  if (!dev(env) && (!env.GUARD || !env.IP_LIMIT || !env.ID_LIMIT || !env.GLOBAL_LIMIT || !env.ID_KEY)) return refuse(503, { code: 'UNAVAILABLE' });
  // The college is struggling or refused Raad: rest, for everyone.
  const rest = await cooldown(env.GUARD);
  if (rest) {
    const seconds = Math.max(1, Math.ceil((Date.parse(rest.until) - Date.now()) / 1000));
    return refuse(503, { code: 'COOLDOWN', until: rest.until }, { 'Retry-After': String(seconds) });
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
  const parts = (Array.isArray(body.pages)
    ? body.pages.filter((p): p is string => typeof p === 'string' && connector.parts.includes(p))
    : [...connector.parts]).filter(p => !s.skip.has(p));

  // Before anything reaches the college: one device, one ID and Raad as a whole
  // can only ask so often, and an ID with too many wrong passwords rests (so a
  // wrong saved password cannot lock the student's real account).
  const id = await idKey(userid, env.ID_KEY);
  if (await limited(env.GLOBAL_LIMIT, 'all') || await limited(env.IP_LIMIT, clientIp(request)) || await limited(env.ID_LIMIT, id)) {
    return refuse(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '60' });
  }
  const failed = await failures(env.GUARD, id);
  if (failed >= MAX_FAILURES) return refuse(429, { code: 'LOCKED' });
  if (!claim(id)) return refuse(429, { code: 'BUSY' }, { 'Retry-After': '10' });

  /** The whole sync, ending in an HTTP status and body; `emit` sees each step. */
  const run = async (emit: (e: ServerEvent) => void): Promise<[number, unknown]> => {
    const t0 = Date.now();
    try {
      const out = await connector.sync(userid, pwd, parts, emit);
      await clearFailures(env.GUARD, id, failed);
      const errs = Object.values(out.errors);
      if (parts.length && errs.length === parts.length && errs.every(e => COLLEGE_TROUBLE.includes(e)) && upstreamFailed()) {
        await startCooldown(env.GUARD, 'UPSTREAM', UPSTREAM_REST_S);
      }
      // What the owner learns: the outcome, the parts that failed and why, and that this student came today.
      const why = Object.fromEntries(Object.entries(out.errors).map(([part, e]) => [part, ERROR_CODES.includes(e) ? e : 'OTHER']));
      countSync(env.STATS, wait, errs.length ? 'PARTIAL' : 'OK', Date.now() - t0, why);
      if (env.STATS) wait?.(pseudonym(userid, env.ID_KEY).then(who => seen(env.STATS, who)));
      return [200, out];
    } catch (e) {
      const code = e instanceof EdgeError ? e.code : 'SERVER_ERROR';
      if (code === 'BAD_CREDENTIALS') await recordFailure(env.GUARD, id);
      if (code === 'BLOCKED') await startCooldown(env.GUARD, 'BLOCKED', BLOCKED_REST_S);
      if (COLLEGE_TROUBLE.includes(code) && upstreamFailed()) await startCooldown(env.GUARD, 'UPSTREAM', UPSTREAM_REST_S);
      countSync(env.STATS, wait, code, Date.now() - t0);
      // `detail` is a safe trace (statuses, paths, cookie names), never credentials or values.
      if (e instanceof EdgeError) {
        const status = code === 'BAD_CREDENTIALS' ? 401 : code === 'ACCOUNT' ? 403 : 502;
        return [status, { code, detail: e.message !== code ? e.message : undefined }];
      }
      console.error('sync failed:', (e as Error).name);
      return [500, { code: 'SERVER_ERROR' }];
    } finally {
      release(id);
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

/** Tests only. */
export const resetHealthCache = () => { health = undefined; };
