// PeopleSoft session client built only on Web APIs (fetch, Headers), so it
// runs unchanged on Cloudflare and in Node. It signs in, fetches pages and
// detects the portal's broken states; parsing happens in the browser.

export const BASE = 'https://sis.bmc.edu.sa';
const SITE = 'hp';
const LOGIN_URL = `${BASE}/psp/${SITE}/?cmd=login&languageCd=ENG&`;
const LOGOUT_URL = `${BASE}/psp/${SITE}/EMPLOYEE/SA/?cmd=logout`;
const CONTENT = `${BASE}/psc/${SITE}/EMPLOYEE/SA/c/`;
const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (compatible; QaedatAlTalib/0.2)';

// Only pages confirmed to open for students. Requesting a page the account is
// not authorized for ends the whole PeopleSoft session, so never add a page
// here without checking it first. Order matters: least certain page last.
export const PAGES = {
  center: 'SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL',
  grades: 'SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL',
  attendance: 'A_AD_MENU.A_SLF_ATT.GBL',
  exams: 'SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL',
};

export class PsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code; // BAD_CREDENTIALS | SESSION_EXPIRED | NOT_AUTHORIZED | TIMEOUT | UPSTREAM
  }
}

class CookieJar {
  constructor() { this.map = new Map(); }
  store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some(a => /^\s*max-age=0/i.test(a)) ||
        attrs.some(a => /^\s*expires=/i.test(a) && Date.parse(a.split('=')[1]) < Date.now());
      if (!value || expired) this.map.delete(name);
      else this.map.set(name, value);
    }
  }
  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join('; '); }
  has(name) { return this.map.has(name); }
}

export function isLoginPage(html) {
  return /name=["']?pwd["']?/i.test(html) && /cmd=login/i.test(html);
}

// Drops scripts and styles so the browser gets a fraction of the bytes.
export function slim(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s{2,}/g, ' ');
}

export class PsSession {
  constructor() { this.jar = new CookieJar(); }

  async request(url, opts = {}, hops = 0) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        ...opts,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, Cookie: this.jar.header(), ...(opts.headers || {}) },
      });
    } catch (e) {
      throw new PsError(e.name === 'AbortError' ? 'TIMEOUT' : 'UPSTREAM', e.message);
    } finally {
      clearTimeout(timer);
    }
    this.jar.store(res);
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location && hops < 10) {
      return this.request(new URL(location, url).href, { headers: opts.headers }, hops + 1);
    }
    return res.text();
  }

  async login(userid, pwd) {
    this.jar = new CookieJar();
    const page = await this.request(LOGIN_URL);
    const form = {};
    for (const [tag] of page.matchAll(/<input\b[^>]*>/gi)) {
      const name = /\bname=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      const type = /\btype=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      if (name && type !== 'checkbox') form[name] = /\bvalue=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    }
    Object.assign(form, {
      userid, pwd, timezoneOffset: '-180', ptlangsel: 'ENG', ptlangcd: 'ENG', Submit: 'Sign In',
    });
    const action = /<form\b[^>]*\baction=["']([^"']+)["']/i.exec(page)?.[1]?.replace(/&amp;/g, '&');
    const html = await this.request(new URL(action || LOGIN_URL, LOGIN_URL).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: LOGIN_URL },
      body: new URLSearchParams(form).toString(),
    });
    if (!this.jar.has('PS_TOKEN') || isLoginPage(html)) {
      throw new PsError('BAD_CREDENTIALS', 'Sign-in was rejected');
    }
  }

  async logout() {
    try { await this.request(LOGOUT_URL); } catch { /* best effort */ }
  }

  async get(pageKey) {
    const html = await this.request(CONTENT + PAGES[pageKey]);
    if (isLoginPage(html)) throw new PsError('SESSION_EXPIRED');
    if (/You are not authorized for this page/i.test(html)) throw new PsError('NOT_AUTHORIZED');
    return slim(html);
  }
}

const RETRYABLE = new Set(['SESSION_EXPIRED', 'NOT_AUTHORIZED', 'TIMEOUT', 'UPSTREAM']);

// Reads every page one at a time. Pages that fail get a second pass in a brand
// new session — the same fix students do by hand (sign out, clear cookies).
export async function collect(userid, pwd) {
  const pages = {};
  const errors = {};
  let pending = Object.keys(PAGES);
  for (let attempt = 1; attempt <= 2 && pending.length; attempt++) {
    const ps = new PsSession();
    await ps.login(userid, pwd); // BAD_CREDENTIALS propagates
    const failed = [];
    for (const key of pending) {
      try {
        pages[key] = await ps.get(key);
        delete errors[key];
      } catch (e) {
        if (!(e instanceof PsError) || !RETRYABLE.has(e.code)) throw e;
        errors[key] = e.code;
        failed.push(key);
        // A failed page usually means the session is gone; stop and start over.
        if (e.code === 'NOT_AUTHORIZED' || e.code === 'SESSION_EXPIRED') {
          failed.push(...pending.slice(pending.indexOf(key) + 1));
          break;
        }
      }
    }
    await ps.logout();
    pending = failed;
  }
  return { pages, errors, fetchedAt: new Date().toISOString() };
}

// Shared request handler for Cloudflare Pages Functions and the dev server.
export async function handleRefresh(request) {
  const json = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  let body;
  try {
    const text = await request.text();
    if (text.length > 4096) return json(413, { code: 'BAD_REQUEST' });
    body = JSON.parse(text || '{}');
  } catch {
    return json(400, { code: 'BAD_REQUEST' });
  }
  const userid = String(body.userid || '').trim();
  const pwd = String(body.pwd || '');
  if (!userid || !pwd) return json(400, { code: 'BAD_REQUEST' });
  try {
    return json(200, await collect(userid, pwd));
  } catch (e) {
    const code = e instanceof PsError ? e.code : 'SERVER_ERROR';
    if (code === 'SERVER_ERROR') console.error('refresh failed:', e.message);
    return json(code === 'BAD_CREDENTIALS' ? 401 : 502, { code });
  }
}
