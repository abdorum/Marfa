// Cloudflare Pages Function for every /api/v1/* route. In production it hands
// the request to the Raad Worker (raad/), which runs next to the college system.
import { handleApi, type Env } from '../../../src/adapters/peoplesoft/edge/router';

interface PagesEnv extends Env {
  RAAD?: { fetch(request: Request): Promise<Response> };
}

export const onRequest = ({ request, env }: { request: Request; env: PagesEnv }) =>
  env.RAAD ? env.RAAD.fetch(request) : handleApi(request, env);
