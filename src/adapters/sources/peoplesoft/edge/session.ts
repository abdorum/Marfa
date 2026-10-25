// PeopleSoft session client built only on Web APIs, so it runs unchanged on
// Cloudflare and in Node: sign in, fetch allowlisted pages, sign out, and
// detect the portal's broken states. No parsing of student data here.
import { EdgeError } from '../../../../../raad/server/connector';
import { USER_AGENT } from '../../../../../raad/server/config';
import { PAGES, PS_BASE, PS_SITE, type PageKey, type PsCode } from '../pages';

export { USER_AGENT };

const LOGIN_URL = `${PS_BASE}/psp/${PS_SITE}/?cmd=login&languageCd=ENG&`;
const LOGOUT_URL = `${PS_BASE}/psp/${PS_SITE}/EMPLOYEE/SA/?cmd=logout`;
const CONTENT = `${PS_BASE}/psc/${PS_SITE}/EMPLOYEE/SA/c/`;
const TIMEOUT_MS = 20000;
export const LOGIN_PAGE = LOGIN_URL;

export class PsError extends EdgeError {
  constructor(public override code: PsCode, message: string = code) {
    super(code, message);
    this.name = 'PsError';
  }
}

class CookieJar {
  private map = new Map<string, string>();

  store(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some(a => /^\s*max-age=0/i.test(a)) ||
        attrs.some(a => /^\s*expires=/i.test(a) && Date.parse(a.split('=')[1] ?? '') < Date.now());
      if (!value || expired) this.map.delete(name);
      else this.map.set(name, value);
    }
  }

  header() { return [...this.map].map(([k, v]) => `${k}=${v}`).join('; '); }
  has(name: string) { return this.map.has(name); }
}

export function isLoginPage(html: string): boolean {
  return /name=["']?pwd["']?/i.test(html) && /cmd=login/i.test(html);
}

/** Drops scripts and styles so the browser gets a fraction of the bytes. */
export function slim(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s{2,}/g, ' ');
}

export class PsSession {
  private jar = new CookieJar();
  private trace: string[] = [];

  private async request(url: string, init: RequestInit = {}, hops = 0): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, Cookie: this.jar.header(), ...(init.headers as Record<string, string> | undefined) },
      });
    } catch (e) {
      throw new PsError((e as Error).name === 'AbortError' ? 'TIMEOUT' : 'UPSTREAM', (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
    this.jar.store(res);
    const location = res.headers.get('location');
    // Safe trace for diagnosing sign-in: status, path, error code, cookie names. Never values.
    const errorCode = location ? new URL(location, url).searchParams.get('errorCode') : null;
    this.trace.push(`${init.method ?? 'GET'} ${new URL(url).pathname} ${res.status}${errorCode ? ` errorCode=${errorCode}` : ''} [${res.headers.getSetCookie().map(c => c.split('=')[0]).join(',')}]`);
    if (res.status >= 300 && res.status < 400 && location && hops < 10) {
      const next = new URL(location, url);
      // The college session cookies go only to the college system, never to another host.
      if (next.origin !== PS_BASE) throw new PsError('UPSTREAM', `redirect to another host: ${next.host}`);
      return this.request(next.href, { headers: init.headers }, hops + 1);
    }
    if (res.status === 403) throw new PsError('BLOCKED', [...this.trace].join(' | '));
    if (res.status >= 500) throw new PsError('UPSTREAM', `HTTP ${res.status}`);
    return res.text();
  }

  async login(userid: string, pwd: string): Promise<void> {
    this.jar = new CookieJar();
    const page = await this.request(LOGIN_URL);
    const form: Record<string, string> = {};
    for (const [tag] of page.matchAll(/<input\b[^>]*>/gi)) {
      const name = /\bname=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      const type = /\btype=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      if (name && type !== 'checkbox') form[name] = /\bvalue=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    }
    Object.assign(form, { userid, pwd, timezoneOffset: '-180', ptlangsel: 'ENG', ptlangcd: 'ENG', Submit: 'Sign In' });
    const action = /<form\b[^>]*\baction=["']([^"']+)["']/i.exec(page)?.[1]?.replace(/&amp;/g, '&');
    const html = await this.request(new URL(action || LOGIN_URL, LOGIN_URL).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: LOGIN_URL },
      body: new URLSearchParams(form).toString(),
    });
    if (!this.jar.has('PS_TOKEN') || isLoginPage(html)) {
      const message = /<span[^>]*class=['"]?PSERRORTEXT[^>]*>([^<]*)/i.exec(html)?.[1]?.trim() ?? /id=['"]?login_error[^>]*>([^<]*)/i.exec(html)?.[1]?.trim();
      throw new PsError('BAD_CREDENTIALS', [...this.trace, `token=${this.jar.has('PS_TOKEN')} loginPage=${isLoginPage(html)}`, message ? `msg=${message.slice(0, 120)}` : ''].filter(Boolean).join(' | '));
    }
  }

  async logout(): Promise<void> {
    try { await this.request(LOGOUT_URL); } catch { /* best effort */ }
  }

  /** Only allowlisted pages can be requested; the edge is not an open proxy. */
  async get(page: PageKey): Promise<string> {
    const html = await this.request(CONTENT + PAGES[page].component);
    if (isLoginPage(html)) throw new PsError('SESSION_EXPIRED');
    // An expired session also answers like this, so it is treated the same way.
    if (/You are not authorized for this page/i.test(html)) throw new PsError('NOT_AUTHORIZED');
    return slim(html);
  }
}
