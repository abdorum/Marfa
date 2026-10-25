// A fake PeopleSoft portal that reproduces the real one's failures.
import { expect, vi } from 'vitest';
import { USER_AGENT } from '../../src/adapters/sources/peoplesoft/edge/session';

export const LOGIN_FORM = `<form action="https://sis.bmc.edu.sa/psp/hp/?&amp;cmd=login&amp;languageCd=ENG" method="post">
  <input type="hidden" name="lcsrf_token" value="tok123"><input type="text" name="userid">
  <input type="password" name="pwd"><input type="checkbox" name="accessible"></form>`;

export function fakePortal({ password = 'secret', brokenOnce = [] as string[], killOn = [] as string[] } = {}) {
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
