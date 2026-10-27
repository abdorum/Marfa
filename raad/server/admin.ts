// The owner's page (/admin/) talks to Raad here, under /api/v1/admin/. Every
// call carries the owner's key (Authorization: Bearer …), the Worker secret
// ADMIN_KEY. Unset, or shorter than 32 characters, the page is closed to
// everyone; a wrong key gets nothing. Changes come only from the site itself.
//
//   GET    /api/v1/admin/state     the switches (the page's and the dashboard's), Raad's rest, his version
//   PUT    /api/v1/admin/switches  sets the page's switches
//   DELETE /api/v1/admin/rest      ends Raad's rest early: the college is back
//   GET    /api/v1/admin/stats     the statistics of the last 30 days (stats.ts)
import type { EdgeConnector } from './connector';
import { RAAD_VERSION } from './config';
import { cooldown, endCooldown, limited, requestAllowed } from './guard';
import { clientIp, json, readJson } from './http';
import type { Env } from './router';
import { readStats } from './stats';
import { dashboardSwitches, parseSwitches, readSwitches, writeSwitches } from './switches';

/** The shortest key the page accepts: anything shorter could be guessed. */
export const MIN_ADMIN_KEY = 32;

/** Compares two secrets in constant time: their digests, so not even their lengths show. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i]! ^ v[i]!;
  return diff === 0;
}

export async function handleAdmin(path: string, request: Request, env: Env, connector: EdgeConnector): Promise<Response> {
  const key = env.ADMIN_KEY ?? '';
  if (key.length < MIN_ADMIN_KEY) return json(503, { code: 'NOT_CONFIGURED' });
  if (env.RAAD_DEV !== '1' && !env.IP_LIMIT) return json(503, { code: 'UNAVAILABLE' });
  if (await limited(env.IP_LIMIT, `admin:${clientIp(request)}`)) return json(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '60' });
  const given = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!given || !(await sameSecret(given, key))) return json(401, { code: 'UNAUTHORIZED' });
  const method = request.method;
  // The key is never sent by a browser on its own, but a change must still come from the site.
  if (method !== 'GET' && !requestAllowed(request.headers)) return json(403, { code: 'FORBIDDEN' });

  if (path === '/api/v1/admin/state' && method === 'GET') {
    const [page, rest] = await Promise.all([readSwitches(env.GUARD), cooldown(env.GUARD)]);
    return json(200, {
      page,
      dashboard: dashboardSwitches(env),
      rest: rest ?? null,
      parts: connector.parts,
      version: RAAD_VERSION,
      build: env.CF_VERSION_METADATA?.id?.slice(0, 8),
      stats: !!env.STATS,
    });
  }
  if (path === '/api/v1/admin/switches' && method === 'PUT') {
    if (!env.GUARD) return json(503, { code: 'UNAVAILABLE' });
    const read = await readJson(request);
    if ('refused' in read) return read.refused;
    const page = parseSwitches(read.body, connector.parts);
    if (!page) return json(400, { code: 'BAD_REQUEST' });
    page.at = new Date().toISOString();
    await writeSwitches(env.GUARD, page);
    return json(200, { page });
  }
  if (path === '/api/v1/admin/rest' && method === 'DELETE') {
    if (!env.GUARD) return json(503, { code: 'UNAVAILABLE' });
    await endCooldown(env.GUARD);
    return json(200, { rest: null });
  }
  if (path === '/api/v1/admin/stats' && method === 'GET') {
    if (!env.STATS) return json(503, { code: 'NO_STATS' });
    try {
      return json(200, await readStats(env.STATS));
    } catch (e) {
      console.error('stats failed:', (e as Error).name);
      return json(503, { code: 'NO_STATS' });
    }
  }
  return json(404, { code: 'NOT_FOUND' });
}
