// The edge against a fake portal that reproduces the real failures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi } from '../../src/adapters/peoplesoft/edge/router';
import { USER_AGENT } from '../../src/adapters/peoplesoft/edge/session';
import { syncPages } from '../../src/adapters/peoplesoft/edge/sync';

const LOGIN_FORM = `<form action="https://sis.bmc.edu.sa/psp/hp/?&amp;cmd=login&amp;languageCd=ENG" method="post">
  <input type="hidden" name="lcsrf_token" value="tok123"><input type="text" name="userid">
  <input type="password" name="pwd"><input type="checkbox" name="accessible"></form>`;

function fakePortal({ password = 'secret', brokenOnce = [] as string[], killOn = [] as string[] } = {}) {
  const log: string[] = [];
  let sessions = 0;
  const broken = new Set(brokenOnce);
  const killed = new Set<string>();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['User-Agent']).toBe(USER_AGENT);
    log.push(`${method} ${u.pathname}${u.search}`);
    const token = /PS_TOKEN=(\w+)/.exec(headers.Cookie ?? '')?.[1];
    if (u.search.includes('cmd=login') && method === 'GET') return new Response(LOGIN_FORM);
    if (u.search.includes('cmd=login') && method === 'POST') {
      const form = new URLSearchParams(String(init.body));
      expect(form.get('lcsrf_token')).toBe('tok123');
      if (form.get('pwd') !== password) return new Response(LOGIN_FORM);
      sessions++;
      return new Response(null, { status: 302, headers: [['Location', '/psp/hp/EMPLOYEE/SA/h/?tab=DEFAULT'], ['Set-Cookie', `PS_TOKEN=s${sessions}; HttpOnly`]] });
    }
    if (u.search.includes('cmd=logout')) return new Response('bye', { headers: [['Set-Cookie', 'PS_TOKEN=; Max-Age=0']] });
    if (!token) return new Response(LOGIN_FORM);
    const page = u.pathname.split('/').pop()!;
    // Like the real portal: asking for a forbidden page kills the session for good.
    if (killed.has(token)) return new Response('<p>You are not authorized for this page.</p>');
    if (killOn.includes(page)) { killed.add(token); return new Response('<p>You are not authorized for this page.</p>'); }
    if (broken.has(page)) { broken.delete(page); return new Response('<p>You are not authorized for this page.</p>'); }
    return new Response(`<html><script>junk()</script><body id="${page}">ok</body></html>`);
  });
  return { log, sessions: () => sessions };
}

afterEach(() => vi.unstubAllGlobals());

describe('syncPages', () => {
  it('reads all pages in one session, strips scripts, signs out', async () => {
    const portal = fakePortal();
    const out = await syncPages('123', 'secret');
    expect(Object.keys(out.pages)).toEqual(['center', 'grades', 'attendance', 'exams']);
    expect(out.errors).toEqual({});
    expect(out.pages.center).not.toContain('junk');
    expect(portal.sessions()).toBe(1);
    expect(portal.log.at(-1)).toContain('cmd=logout');
    expect(out.log.map(s => s.label)).toEqual(['SIGN_IN', 'PAGE center', 'PAGE grades', 'PAGE attendance', 'PAGE exams']);
  });

  it('starts a fresh session after "not authorized" and stops asking the dead one', async () => {
    const portal = fakePortal({ brokenOnce: ['SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL'] });
    const out = await syncPages('123', 'secret');
    expect(out.errors).toEqual({});
    expect(Object.keys(out.pages)).toHaveLength(4);
    expect(portal.sessions()).toBe(2);
    const firstSession = portal.log.slice(0, portal.log.findIndex(l => l.includes('cmd=logout')));
    expect(firstSession.some(l => l.includes('A_SLF_ATT'))).toBe(false);
  });

  it('reports pages that fail in both sessions without losing the others', async () => {
    fakePortal({ killOn: ['SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL'] });
    const out = await syncPages('123', 'secret');
    expect(Object.keys(out.pages)).toEqual(['center', 'grades', 'attendance']);
    expect(out.errors).toEqual({ exams: 'NOT_AUTHORIZED' });
  });

  it('only fetches the pages asked for', async () => {
    const portal = fakePortal();
    await syncPages('123', 'secret', ['attendance']);
    expect(portal.log.filter(l => l.includes('/c/'))).toEqual(['GET /psc/hp/EMPLOYEE/SA/c/A_AD_MENU.A_SLF_ATT.GBL']);
  });
});

describe('handleApi', () => {
  const post = (body: unknown, path = '/api/v1/sync') =>
    handleApi(new Request(`http://x${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

  it('wrong password is a 401 with one sign-in attempt only', async () => {
    const portal = fakePortal();
    const res = await post({ userid: '1', pwd: 'nope' });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'BAD_CREDENTIALS' });
    expect(body.detail).not.toContain('nope'); // the trace never carries the password
    expect(portal.log.filter(l => l.startsWith('POST'))).toHaveLength(1);
  });

  it('a firewall 403 is reported as BLOCKED, never as a wrong password', async () => {
    vi.stubGlobal('fetch', async () => new Response('Forbidden', { status: 403 }));
    const res = await post({ userid: '1', pwd: 'right' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'BLOCKED' });
  });

  it('rejects bad requests before contacting the portal', async () => {
    const portal = fakePortal();
    expect((await post('{"userid":"1"}')).status).toBe(400);
    expect((await post('x'.repeat(5000))).status).toBe(413);
    expect((await post({}, '/api/v1/other')).status).toBe(404);
    expect(portal.log).toHaveLength(0);
  });

  it('keeps only whitelisted, bounded metric fields', async () => {
    const points: unknown[] = [];
    const env = { METRICS: { writeDataPoint: (p: unknown) => points.push(p) } };
    const send = (body: unknown) => handleApi(new Request('http://x/api/v1/metrics', { method: 'POST', body: JSON.stringify(body) }), env);
    const good = { jobType: 'sync', outcome: 'succeeded', attempts: 2, sessionResets: 1, errorClasses: ['NOT_AUTHORIZED', 'evil'], durationMs: 5300, appVersion: '0.3.0', userid: '2412345' };
    expect((await send(good)).status).toBe(204);
    expect(points).toEqual([{ indexes: ['sync'], blobs: ['sync', 'succeeded', '0.3.0', 'NOT_AUTHORIZED'], doubles: [2, 1, 5300] }]);
    expect(JSON.stringify(points)).not.toContain('2412345');
    expect((await send({ ...good, attempts: -1 })).status).toBe(400);
    expect((await send({ ...good, jobType: 'x' })).status).toBe(400);
    expect((await handleApi(new Request('http://x/api/v1/metrics', { method: 'POST', body: JSON.stringify(good) }))).status).toBe(204); // no binding: accepted, dropped
  });

  it('ignores page names outside the allowlist', async () => {
    const portal = fakePortal();
    const res = await post({ userid: '1', pwd: 'secret', pages: ['grades', 'SSS_MY_ACAD', '../x'] });
    expect(res.status).toBe(200);
    expect(portal.log.filter(l => l.includes('/c/'))).toEqual(['GET /psc/hp/EMPLOYEE/SA/c/SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL']);
  });
});
