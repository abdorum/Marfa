// Raad's server over HTTP, besides the data (raad/server/router.ts): his status
// (GET /api/v1/status), which never reaches the college, so asking is cheap;
// when the student signs out, that their pseudonym may go; and a college a
// student asks for.
import type { RaadServer, ServerStatus } from '../../ports/raad';

export function createRaadServer(appVersion: string, base = '/api/v1'): RaadServer {
  return {
    async status() {
      try {
        // The version tells the owner how many have the latest app; nothing else goes with it.
        const res = await fetch(`${base}/status`, { cache: 'no-store', headers: { 'X-Taleeb-App': appVersion } });
        if (!res.ok) return undefined;
        const body = (await res.json()) as Partial<ServerStatus>;
        return {
          paused: !!body.paused,
          auto: body.auto === true || undefined,
          until: typeof body.until === 'string' ? body.until : undefined,
          message: body.message,
          notice: body.notice,
          staleMinutes: typeof body.staleMinutes === 'number' ? body.staleMinutes : undefined,
        };
      } catch {
        return undefined;
      }
    },
    forget(userid) {
      void fetch(`${base}/forget`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userid }), keepalive: true }).catch(() => {});
    },
    async wish(w) {
      try {
        const res = await fetch(`${base}/wish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w) });
        return res.status === 204 ? 'sent' : res.status === 429 ? 'busy' : 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}
