// Cloudflare Pages Function for every /api/v1/* route. It hands the request to
// Raad's server (raad/), which runs next to the college system and can only be
// reached through here. Without that binding (a misconfigured preview) the
// server code runs here, and refuses every sync, since none of its protections
// are bound here (raad/server/router.ts).
import { handleApi, type Env, type ExecutionContext } from '../../../raad/server/router';

interface PagesEnv extends Env {
  RAAD?: { fetch(request: Request): Promise<Response> };
}

export const onRequest = ({ request, env, waitUntil }: { request: Request; env: PagesEnv; waitUntil: ExecutionContext['waitUntil'] }) => {
  // Raad limits each address; it sees the student's address only if it is passed on.
  // Whatever a client sent in this header is replaced.
  const forwarded = new Request(request);
  forwarded.headers.set('X-Taleeb-Client-IP', request.headers.get('CF-Connecting-IP') ?? 'unknown');
  return env.RAAD ? env.RAAD.fetch(forwarded) : handleApi(forwarded, { ...env, RAAD_DEV: undefined }, { waitUntil });
};
