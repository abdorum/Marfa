// Runs the PeopleSoft client against a fake portal that reproduces the real
// failure: a page answering "not authorized" until a fresh session is used.
import test from 'node:test';
import assert from 'node:assert';
import { collect, handleRefresh } from '../src/peoplesoft.js';

const LOGIN_FORM = `<form action="https://sis.bmc.edu.sa/psp/hp/?&amp;cmd=login&amp;languageCd=ENG" method="post">
  <input type="hidden" name="lcsrf_token" value="tok123"><input type="text" name="userid">
  <input type="password" name="pwd"><input type="checkbox" name="accessible"></form>`;

function fakePortal({ password = 'secret', brokenOnce = [] } = {}) {
  const log = [];
  let sessions = 0;
  const broken = new Set(brokenOnce);
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    log.push(`${method} ${u.pathname}${u.search}`);
    const cookie = opts.headers?.Cookie || '';
    if (u.search.includes('cmd=login') && method === 'GET') return new Response(LOGIN_FORM);
    if (u.search.includes('cmd=login') && method === 'POST') {
      const form = new URLSearchParams(opts.body);
      assert.strictEqual(form.get('lcsrf_token'), 'tok123');
      if (form.get('pwd') !== password) return new Response(LOGIN_FORM);
      sessions++;
      return new Response(null, {
        status: 302,
        headers: [['Location', '/psp/hp/EMPLOYEE/SA/h/?tab=DEFAULT'], ['Set-Cookie', `PS_TOKEN=s${sessions}; HttpOnly`]],
      });
    }
    if (u.search.includes('cmd=logout')) return new Response('bye', { headers: [['Set-Cookie', 'PS_TOKEN=; Max-Age=0']] });
    if (!cookie.includes('PS_TOKEN=')) return new Response(LOGIN_FORM);
    const page = u.pathname.split('/').pop();
    if (broken.has(page)) { broken.delete(page); return new Response('<p>You are not authorized for this page.</p>'); }
    return new Response(`<html><script>junk()</script><body id="${page}">ok</body></html>`);
  };
  return { log, sessions: () => sessions };
}

test('reads all pages in one session', async () => {
  const portal = fakePortal();
  const out = await collect('123', 'secret');
  assert.deepStrictEqual(Object.keys(out.pages), ['center', 'grades', 'attendance', 'exams']);
  assert.deepStrictEqual(out.errors, {});
  assert.ok(!out.pages.center.includes('junk'), 'scripts are stripped');
  assert.strictEqual(portal.sessions(), 1);
});

test('a "not authorized" page triggers one fresh session for the rest', async () => {
  const portal = fakePortal({ brokenOnce: ['SSR_SSENRL_GRADE.GBL'.replace(/^/, 'SA_LEARNER_SERVICES.')] });
  const out = await collect('123', 'secret');
  assert.deepStrictEqual(out.errors, {});
  assert.strictEqual(Object.keys(out.pages).length, 4);
  assert.strictEqual(portal.sessions(), 2);
  // After the failure the first session stops instead of hitting more pages.
  const firstSession = portal.log.slice(0, portal.log.findIndex(l => l.includes('cmd=logout')));
  assert.ok(!firstSession.some(l => l.includes('A_SLF_ATT')));
});

test('wrong password is a 401 with no retry', async () => {
  const portal = fakePortal();
  const res = await handleRefresh(new Request('http://x/api/refresh', { method: 'POST', body: JSON.stringify({ userid: '1', pwd: 'nope' }) }));
  assert.strictEqual(res.status, 401);
  assert.deepStrictEqual(await res.json(), { code: 'BAD_CREDENTIALS' });
  assert.strictEqual(portal.log.filter(l => l.startsWith('POST')).length, 1);
});

test('bad request bodies are rejected before contacting the portal', async () => {
  const portal = fakePortal();
  const res = await handleRefresh(new Request('http://x/api/refresh', { method: 'POST', body: '{"userid":"1"}' }));
  assert.strictEqual(res.status, 400);
  assert.strictEqual(portal.log.length, 0);
});
