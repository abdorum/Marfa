// Reads the requested pages one at a time. Pages that fail get a second pass
// in a brand-new session — the same fix students do by hand (sign out, clear
// cookies, sign in again). Every step is reported as it happens.
import type { ServerEvent } from '../../../../../raad/server/connector';
import { PAGE_KEYS, type PageKey, type PsCode, type ServerStep, type SyncResponse } from '../pages';
import { PsError, PsSession } from './session';

const SESSION_CODES: readonly PsCode[] = ['SESSION_EXPIRED', 'NOT_AUTHORIZED'];
const RETRYABLE: readonly PsCode[] = [...SESSION_CODES, 'TIMEOUT', 'UPSTREAM'];

export async function syncPages(
  userid: string, pwd: string, wanted: PageKey[] = PAGE_KEYS,
  newSession = () => new PsSession(), emit: (e: ServerEvent) => void = () => {},
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

  let pending = PAGE_KEYS.filter(k => wanted.includes(k));
  for (let pass = 1; pass <= 2 && pending.length; pass++) {
    const ps = newSession();
    await timed('SIGN_IN', { key: 'signin' }, () => ps.login(userid, pwd)); // BAD_CREDENTIALS ends everything
    const failed: PageKey[] = [];
    for (const [i, key] of pending.entries()) {
      try {
        pages[key] = await timed(`PAGE ${key}`, { key: 'fetch', note: key }, () => ps.get(key));
        delete errors[key];
      } catch (e) {
        if (!(e instanceof PsError) || !RETRYABLE.includes(e.code)) throw e;
        errors[key] = e.code;
        failed.push(key);
        // The session is gone: asking for more pages in it only fails slower.
        if (SESSION_CODES.includes(e.code)) {
          failed.push(...pending.slice(i + 1));
          break;
        }
      }
    }
    const t0 = Date.now();
    emit({ key: 'signout', status: 'start' });
    await ps.logout();
    emit({ key: 'signout', status: 'ok', ms: Date.now() - t0 });
    pending = failed;
  }
  return { pages, errors, log, fetchedAt: new Date().toISOString() };
}
