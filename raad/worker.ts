// Raad's server as its own Worker, running next to the college system (Azure
// West Europe). The site reaches it through a service binding (Docs/05).
import { handleApi, type Env, type ExecutionContext } from './server/router';
import { purge } from './server/stats';

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handleApi(request, env, ctx),
  // Every night (wrangler.toml: [triggers]): pseudonyms a year unused, and counts two years old, are deleted.
  scheduled: (_event: unknown, env: Env, ctx: ExecutionContext) => ctx.waitUntil(env.STATS ? purge(env.STATS) : Promise.resolve()),
};
