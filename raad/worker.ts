// Raad's server as its own Worker, running next to the college system (Azure
// West Europe). The site reaches it through a service binding (Docs/05).
import { handleApi, type Env, type ExecutionContext } from './server/router';
import { purge } from './server/stats';
import { purgeWishes } from './server/wishes';

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handleApi(request, env, ctx),
  // Every night (wrangler.toml: [triggers]): pseudonyms a year unused, and counts and colleges asked for two years old, are deleted.
  scheduled: (_event: unknown, env: Env, ctx: ExecutionContext) => ctx.waitUntil(env.STATS ? Promise.all([purge(env.STATS), purgeWishes(env.STATS)]) : Promise.resolve()),
};
