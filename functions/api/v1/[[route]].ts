// Cloudflare Pages Function for every /api/v1/* route. In production it hands
// the request to Raad's server (raad/), which runs next to the college system.
import { handleApi, type Env, type ExecutionContext } from '../../../raad/server/router';

interface PagesEnv extends Env {
  RAAD?: { fetch(request: Request): Promise<Response> };
}

export const onRequest = ({ request, env, waitUntil }: { request: Request; env: PagesEnv; waitUntil: ExecutionContext['waitUntil'] }) =>
  env.RAAD ? env.RAAD.fetch(request) : handleApi(request, env, { waitUntil });
