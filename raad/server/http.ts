// What every answer of Raad's server shares: JSON, never cached, and the
// address a request came from.

/** The largest request body Raad reads. */
export const MAX_BODY = 4096;

export const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...HEADERS, ...extra },
});

/**
 * The address the student's request came from. The site's Pages Function
 * forwards it in X-Taleeb-Client-IP, since Raad can only be reached through it
 * (no public address); a direct call (dev) has CF-Connecting-IP.
 */
export const clientIp = (request: Request) => request.headers.get('X-Taleeb-Client-IP') ?? request.headers.get('CF-Connecting-IP') ?? 'unknown';

/** A JSON body of at most MAX_BODY characters, or the response that refuses it. */
export async function readJson(request: Request): Promise<{ body: Record<string, unknown> } | { refused: Response }> {
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) return { refused: json(415, { code: 'BAD_REQUEST' }) };
  // A body that says it is too big is refused before it is read.
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return { refused: json(413, { code: 'BAD_REQUEST' }) };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { refused: json(413, { code: 'BAD_REQUEST' }) };
    const body: unknown = JSON.parse(text || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? { body: body as Record<string, unknown> } : { refused: json(400, { code: 'BAD_REQUEST' }) };
  } catch {
    return { refused: json(400, { code: 'BAD_REQUEST' }) };
  }
}
