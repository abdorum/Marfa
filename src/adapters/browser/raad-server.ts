// Raad's server status over HTTP (raad/server/router.ts: GET /api/v1/status).
// It never reaches the college system, so asking is cheap.
import type { RaadServer, ServerStatus } from '../../ports/raad';

export function createRaadServer(endpoint = '/api/v1/status'): RaadServer {
  return {
    async status() {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
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
  };
}
