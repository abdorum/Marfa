// Reads the requested pages one at a time. Pages that lost their session get
// a second pass in a brand-new one — the same fix students do by hand (sign
// out, clear cookies, sign in again). A timeout or a college error gets no
// second pass here: the browser decides, after a pause, so a struggling
// college is not asked twice as often. Every step is reported as it happens,
// and every session that signed in is signed out, whatever happens.
import type { ServerEvent } from '../../../../ports/edge';
import { type PageKey, type PsCode, type ServerStep, type SyncResponse } from '../pages';
import { PsError, type PsSession } from './session';

const SESSION_CODES: readonly PsCode[] = ['SESSION_EXPIRED', 'NOT_AUTHORIZED'];
/** Failures that cost one page, not the whole sync. */
const PER_PAGE: readonly PsCode[] = [...SESSION_CODES, 'TIMEOUT', 'UPSTREAM'];

export async function syncPages(
  newSession: () => PsSession, userid: string, pwd: string, wanted: readonly PageKey[],
  emit: (e: ServerEvent) => void = () => {},
): Promise<SyncResponse> {
  const pages: SyncResponse['pages'] = {};
  const errors: SyncResponse['errors'] = {};
  const log: ServerStep[] = [];
  const timed = async <T>(label: string, event: Pick<ServerEvent, 'key' | 'note'>, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    emit({ ...event, status: 'start' });
    try {
      const out = await fn();
      log.push({ label, ok: true, ms: Date.now() - t0 });
      emit({ ...event, status: 'ok', ms: Date.now() - t0 });
      return out;
    } catch (e) {
      const code = e instanceof PsError ? e.code : 'UPSTREAM';
      log.push({ label, ok: false, ms: Date.now() - t0, note: code });
      emit({ ...event, status: 'fail', ms: Date.now() - t0, note: event.note ? `${event.note}:${code}` : code });
      throw e;
    }
  };

  let pending = [...wanted];
  for (let pass = 1; pass <= 2 && pending.length; pass++) {
    const ps = newSession();
    try {
      await timed('SIGN_IN', { key: 'signin' }, () => ps.login(userid, pwd));
    } catch (e) {
      // The first sign-in decides the whole sync (a wrong password ends it).
      // A second one failing must not lose the pages the first pass read.
      if (pass === 1) throw e;
      for (const key of pending) errors[key] ??= e instanceof PsError && PER_PAGE.includes(e.code) ? e.code : 'UPSTREAM';
      break;
    }
    const failed: PageKey[] = [];
    try {
      for (const [i, key] of pending.entries()) {
        try {
          pages[key] = await timed(`PAGE ${key}`, { key: 'fetch', note: key }, () => ps.get(key));
          delete errors[key];
        } catch (e) {
          if (!(e instanceof PsError) || !PER_PAGE.includes(e.code)) throw e;
          errors[key] = e.code;
          if (!SESSION_CODES.includes(e.code)) continue;
          // The session is gone: asking for more pages in it only fails slower.
          failed.push(key, ...pending.slice(i + 1));
          break;
        }
      }
    } finally {
      const t0 = Date.now();
      emit({ key: 'signout', status: 'start' });
      await ps.logout();
      emit({ key: 'signout', status: 'ok', ms: Date.now() - t0 });
    }
    pending = failed;
  }
  return { pages, errors, log, fetchedAt: new Date().toISOString() };
}
