// Cloudflare Pages Function for every /api/v1/* route.
import { handleApi } from '../../../src/adapters/peoplesoft/edge/router';

export const onRequest = ({ request }: { request: Request }) => handleApi(request);
