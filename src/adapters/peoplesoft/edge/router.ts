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

export async function handleApi(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  if (path !== '/api/v1/sync') return json(404, { code: 'NOT_FOUND' });
  if (request.method !== 'POST') return json(405, { code: 'METHOD' });

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
