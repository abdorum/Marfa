// The PeopleSoft source as the browser sees it: one attempt = one call to
// Raad's server, which streams its steps as it works; the pages it returns
// are then read here, on the student's device.
import { RaadError } from '../../../../raad/engine/types';
import type { SyncResult } from '../../../core/model';
import type { AdapterManifest, Credentials, SourceContext, StudentDataSource } from '../../../ports/source';
import { extractCapabilities, extractGrids } from './extract/generic';
import { extractAttendance, extractCenter, extractExams, extractGrades } from './extract/pages';
import { mapToSnapshot, type Extracted } from './map';
import { isPageKey, PAGE_KEYS, PAGES, type PageKey, type PsCode, type SyncResponse } from './pages';

export const PEOPLESOFT_MANIFEST: AdapterManifest = {
  id: 'peoplesoft',
  reads: 'Oracle PeopleSoft Campus Solutions (Student Center)',
  tier: 'D',
  provides: ['student', 'schedule', 'attendance', 'grades', 'exams', 'notices', 'extras'],
  credentials: 'password',
  maintainer: 'owner',
  readOnly: true,
};

export interface PeopleSoftSourceOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  parseHtml?: (html: string) => Document;
  /** The institution's name, as the student record carries it. */
  institution?: string;
  /** Dev only: receives the raw pages, e.g. to save anonymized test fixtures. */
  onRaw?: (pages: SyncResponse['pages'], extracted: Extracted, credentials: Credentials) => void;
}

const EXTRACTORS: { [K in PageKey]: (doc: Document) => NonNullable<Extracted[K]> } = {
  center: extractCenter,
  grades: extractGrades,
  attendance: extractAttendance,
  exams: extractExams,
};

function failureFor(status: number, code: string | undefined): RaadError {
  if (status === 401) return new RaadError('CREDENTIALS');
  // Too many wrong passwords: waiting and retrying would only extend the lock.
  if (code === 'LOCKED') return new RaadError('CREDENTIALS', 'LOCKED');
  if (code === 'PAUSED') return new RaadError('PAUSED');
  if (status === 429) return new RaadError('RATE_LIMIT');
  if (code === 'BLOCKED') return new RaadError('UNEXPECTED', 'BLOCKED');
  if (code === 'SESSION_EXPIRED' || code === 'NOT_AUTHORIZED') return new RaadError('SESSION', code);
  if (status >= 500) return new RaadError('TRANSIENT', code ?? `HTTP ${status}`);
  return new RaadError('UNEXPECTED', code ?? `HTTP ${status}`);
}

type Line =
  | { t: 'step'; key: 'signin' | 'fetch' | 'signout'; status: 'start' | 'ok' | 'fail'; ms?: number; note?: string }
  | { t: 'done'; status: number; body: Partial<SyncResponse> & { code?: string } };

/** Reads an NDJSON stream line by line; returns the closing line, if it came. */
async function readLines(res: Response, onLine: (l: Line) => void): Promise<Extract<Line, { t: 'done' }> | undefined> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: Extract<Line, { t: 'done' }> | undefined;
  const take = (text: string) => {
    if (!text.trim()) return;
    const line = JSON.parse(text) as Line;
    if (line.t === 'done') done = line;
    else onLine(line);
  };
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      take(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  take(buffer + decoder.decode());
  return done;
}

export function createPeopleSoftSource(opts: PeopleSoftSourceOptions = {}): StudentDataSource {
  const endpoint = opts.endpoint ?? '/api/v1/sync';
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const parseHtml = opts.parseHtml ?? ((html: string) => new DOMParser().parseFromString(html, 'text/html'));
  const areasOf = (note?: string) => {
    const page = note?.split(':')[0];
    return isPageKey(page) ? [...PAGES[page].areas] : undefined;
  };

  return {
    manifest: PEOPLESOFT_MANIFEST,
    async sync(ctx: SourceContext): Promise<SyncResult> {
      const credentials = ctx.credentials;
      if (!credentials) throw new RaadError('CREDENTIALS', 'NO_CREDENTIALS');

      let res: Response;
      const t0 = Date.now();
      ctx.step('connect', 'start');
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json' },
          body: JSON.stringify({ userid: credentials.userid, pwd: credentials.pwd, pages: PAGE_KEYS }),
          signal: ctx.signal,
        });
      } catch (e) {
        ctx.step('connect', 'fail', { ms: Date.now() - t0 });
        throw new RaadError(ctx.signal.aborted ? 'CANCELLED' : 'TRANSIENT', (e as Error).message);
      }
      ctx.step('connect', 'ok', { ms: Date.now() - t0 });

      let body: Partial<SyncResponse> & { code?: string };
      if (res.ok && /application\/x-ndjson/i.test(res.headers.get('Content-Type') ?? '') && res.body) {
        // Raad's server tells each step as it happens.
        let done: Awaited<ReturnType<typeof readLines>>;
        try {
          done = await readLines(res, l => {
            if (l.t === 'step') ctx.step(l.key, l.status, { ms: l.ms, note: l.note, areas: l.key === 'fetch' ? areasOf(l.note) : undefined });
          });
        } catch (e) {
          throw new RaadError(ctx.signal.aborted ? 'CANCELLED' : 'TRANSIENT', (e as Error).message);
        }
        if (!done) throw new RaadError('TRANSIENT', 'STREAM_CUT');
        if (done.status !== 200) throw failureFor(done.status, done.body.code);
        body = done.body;
      } else {
        body = await res.json().catch(() => ({})) as typeof body;
        if (!res.ok) throw failureFor(res.status, body.code);
        // An older server: replay its log.
        for (const s of body.log ?? []) {
          const page = s.label.startsWith('PAGE ') ? s.label.slice(5) : undefined;
          ctx.step(page ? 'fetch' : 'signin', s.ok ? 'ok' : 'fail', { ms: s.ms, note: page ?? s.note, areas: areasOf(page) });
        }
      }

      const x0 = Date.now();
      ctx.step('extract', 'start');
      const extracted: Extracted = { blocks: [] };
      const failures: Partial<Record<PageKey, PsCode | 'PARSE'>> = { ...body.errors };
      for (const key of PAGE_KEYS) {
        const html = body.pages?.[key];
        if (!html) continue;
        try {
          const doc = parseHtml(html);
          (extracted as Record<PageKey, unknown>)[key] = EXTRACTORS[key](doc);
          // Unknown grids are a bonus: a failure here must not lose the page.
          try { extracted.blocks!.push(...extractGrids(doc, key)); } catch { /* ignore */ }
          if (key === 'center') extracted.capabilities = extractCapabilities(doc);
        } catch {
          failures[key] = 'PARSE';
        }
      }

      const got = PAGE_KEYS.filter(k => extracted[k] !== undefined);
      if (!got.length) {
        ctx.step('extract', 'fail', { ms: Date.now() - x0 });
        const codes = Object.values(failures);
        throw codes.some(c => c === 'SESSION_EXPIRED' || c === 'NOT_AUTHORIZED')
          ? new RaadError('SESSION')
          : new RaadError(codes.includes('PARSE') ? 'UNEXPECTED' : 'TRANSIENT', codes[0]);
      }
      opts.onRaw?.(body.pages ?? {}, extracted, credentials);
      const result = mapToSnapshot(extracted, failures, credentials.userid, body.fetchedAt ?? new Date().toISOString(), opts.institution ?? '');
      ctx.step('extract', 'ok', { ms: Date.now() - x0 });
      return result;
    },
  };
}
