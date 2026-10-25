// Raad's server as its own Worker, running next to the college system (Azure
// West Europe). The site reaches it through a service binding (Docs/05).
import { handleApi, type Env, type ExecutionContext } from './server/router';

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => handleApi(request, env, ctx),
};
