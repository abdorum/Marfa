// Cloudflare Pages Function for every /api/v1/* route.
import { handleApi, type Env } from '../../../src/adapters/peoplesoft/edge/router';

export const onRequest = ({ request, env }: { request: Request; env: Env }) => handleApi(request, env);
