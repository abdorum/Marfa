// Cloudflare Pages Function: POST /api/refresh
// Stateless: signs in to PeopleSoft, returns the raw pages, signs out.
import { handleRefresh } from '../../src/peoplesoft.js';

export const onRequestPost = ({ request }) => handleRefresh(request);
