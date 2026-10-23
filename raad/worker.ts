// Raad's edge as its own Worker, run next to the college system (Azure West
// Europe). The site reaches it through a service binding (Docs/10, Docs/05).
import { handleApi, type Env } from '../src/adapters/peoplesoft/edge/router';

export default {
  fetch: (request: Request, env: Env) => handleApi(request, env),
};
