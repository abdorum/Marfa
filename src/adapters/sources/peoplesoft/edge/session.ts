// PeopleSoft session client built only on Web APIs, so it runs unchanged on
// Cloudflare and in Node: sign in, fetch allowlisted pages, sign out, and
// detect the portal's broken states. No parsing of student data here.
import { EdgeError } from '../../../../ports/edge';
import { PAGES, type PageKey, type PsCode, type PsConfig } from '../pages';

const TIMEOUT_MS = 20000;

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

/** The college's words on a refused sign-in, when it said any. */
const signInMessage = (html: string) =>
  /<span[^>]*class=['"]?PSERRORTEXT[^>]*>([^<]*)/i.exec(html)?.[1]?.trim() ?? /id=['"]?login_error[^>]*>([^<]*)/i.exec(html)?.[1]?.trim();

/** A refusal that is about the account, not the password the student typed. */
const ACCOUNT_REFUSAL = /locked|disabled|expired|inactive|suspended|change your password/i;

/**
 * Drops what the browser does not need: scripts, styles, comments, and the
 * page's note on the college's own servers (pt_envinfo), which is nobody's business.
 */
export function slim(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<div\b[^>]*\bid=['"]?pt_envinfo[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s{2,}/g, ' ');
}

export class PsSession {
  private jar = new CookieJar();
  private trace: string[] = [];

  constructor(private config: PsConfig) {}

  private get loginUrl() { return `${this.config.base}/psp/${this.config.site}/?cmd=login&languageCd=ENG&`; }

  private async request(url: string, init: RequestInit = {}, hops = 0): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': this.config.userAgent, Cookie: this.jar.header(), ...(init.headers as Record<string, string> | undefined) },
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
      if (next.origin !== this.config.base) throw new PsError('UPSTREAM', `redirect to another host: ${next.host}`);
      return this.request(next.href, { headers: init.headers }, hops + 1);
    }
    if (res.status === 403) throw new PsError('BLOCKED', [...this.trace].join(' | '));
    if (res.status >= 500) throw new PsError('UPSTREAM', `HTTP ${res.status}`);
    return res.text();
  }

  async login(userid: string, pwd: string): Promise<void> {
    this.jar = new CookieJar();
    const page = await this.request(this.loginUrl);
    const form: Record<string, string> = {};
    for (const [tag] of page.matchAll(/<input\b[^>]*>/gi)) {
      const name = /\bname=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      const type = /\btype=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      if (name && type !== 'checkbox') form[name] = /\bvalue=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    }
    Object.assign(form, { userid, pwd, timezoneOffset: this.config.timezoneOffset, ptlangsel: 'ENG', ptlangcd: 'ENG', Submit: 'Sign In' });
    const action = /<form\b[^>]*\baction=["']([^"']+)["']/i.exec(page)?.[1]?.replace(/&amp;/g, '&');
    const html = await this.request(new URL(action || this.loginUrl, this.loginUrl).href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: this.loginUrl },
      body: new URLSearchParams(form).toString(),
    });
    const token = this.jar.has('PS_TOKEN');
    const loginAgain = isLoginPage(html);
    if (token && !loginAgain) return;
    const message = signInMessage(html);
    const trace = [...this.trace, `token=${token} loginPage=${loginAgain}`, message ? `msg=${message.slice(0, 120)}` : ''].filter(Boolean).join(' | ');
    // Only the sign-in page shown again, with no session, means the password was
    // refused. A maintenance page, a password-change page or anything unknown is
    // not the student's fault: it must never count against their ID, nor erase
    // a password they saved.
    if (!token && loginAgain) throw new PsError(message && ACCOUNT_REFUSAL.test(message) ? 'ACCOUNT' : 'BAD_CREDENTIALS', trace);
    throw new PsError(message && ACCOUNT_REFUSAL.test(message) ? 'ACCOUNT' : 'UPSTREAM', trace);
  }

  async logout(): Promise<void> {
    try { await this.request(`${this.config.base}/psp/${this.config.site}/EMPLOYEE/SA/?cmd=logout`); } catch { /* best effort */ }
  }

  /** Only allowlisted pages can be requested; the edge is not an open proxy. */
  async get(page: PageKey): Promise<string> {
    if (!this.config.pages.includes(page)) throw new PsError('NOT_AUTHORIZED', `${page} is not enabled for this institution`);
    const html = await this.request(`${this.config.base}/psc/${this.config.site}/EMPLOYEE/SA/c/${PAGES[page].component}`);
    if (isLoginPage(html)) throw new PsError('SESSION_EXPIRED');
    // An expired session also answers like this, so it is treated the same way.
    if (/You are not authorized for this page/i.test(html)) throw new PsError('NOT_AUTHORIZED');
    return slim(html);
  }
}
