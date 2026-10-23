// The PeopleSoft source as the browser sees it: one attempt = one call to the
// edge, then the raw pages are extracted here, on the student's device.
import { RaadError } from '../../core/bot/types';
import type { SyncResult } from '../../core/model';
import type { Credentials, SourceContext, StudentDataSource } from '../ports';
import { extractCapabilities, extractGrids } from './extract/generic';
import { extractAttendance, extractCenter, extractExams, extractGrades } from './extract/pages';
import { mapToSnapshot, type Extracted } from './map';
import { PAGE_KEYS, type PageKey, type PsCode, type SyncResponse } from './pages';

export interface PeopleSoftSourceOptions {
  endpoint?: string;
  fetch?: typeof fetch;
  parseHtml?: (html: string) => Document;
  /** Dev only: receives the raw pages, e.g. to save anonymized test fixtures. */
  onRaw?: (pages: SyncResponse['pages'], extracted: Extracted, credentials: Credentials) => void;
}

const EXTRACTORS: { [K in PageKey]: (doc: Document) => NonNullable<Extracted[K]> } = {
  center: extractCenter,
  grades: extractGrades,
  attendance: extractAttendance,
  exams: extractExams,
};

const STEP_LABELS: Record<string, string> = { SIGN_IN: 'SIGN IN' };

function failureFor(status: number, code: string | undefined): RaadError {
  if (status === 401) return new RaadError('CREDENTIALS');
  if (status === 429) return new RaadError('RATE_LIMIT');
  if (code === 'SESSION_EXPIRED' || code === 'NOT_AUTHORIZED') return new RaadError('SESSION', code);
  if (status >= 500) return new RaadError('TRANSIENT', code ?? `HTTP ${status}`);
  return new RaadError('UNEXPECTED', code ?? `HTTP ${status}`);
}

export function createPeopleSoftSource(opts: PeopleSoftSourceOptions = {}): StudentDataSource {
  const endpoint = opts.endpoint ?? '/api/v1/sync';
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const parseHtml = opts.parseHtml ?? ((html: string) => new DOMParser().parseFromString(html, 'text/html'));

  return {
    id: 'peoplesoft',
    async sync(ctx: SourceContext): Promise<SyncResult> {
      const credentials = ctx.credentials;
      if (!credentials) throw new RaadError('CREDENTIALS', 'NO_CREDENTIALS');

      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userid: credentials.userid, pwd: credentials.pwd, pages: PAGE_KEYS }),
          signal: ctx.signal,
        });
      } catch (e) {
        throw new RaadError(ctx.signal.aborted ? 'CANCELLED' : 'TRANSIENT', (e as Error).message);
      }
      const body = await res.json().catch(() => ({})) as Partial<SyncResponse> & { code?: string };
      if (!res.ok) throw failureFor(res.status, body.code);

      for (const s of body.log ?? []) ctx.step(STEP_LABELS[s.label] ?? s.label, s.ok ? 'ok' : 'fail', { ms: s.ms, note: s.note });

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
        const codes = Object.values(failures);
        throw codes.some(c => c === 'SESSION_EXPIRED' || c === 'NOT_AUTHORIZED')
          ? new RaadError('SESSION')
          : new RaadError(codes.includes('PARSE') ? 'UNEXPECTED' : 'TRANSIENT', codes[0]);
      }
      opts.onRaw?.(body.pages ?? {}, extracted, credentials);
      return mapToSnapshot(extracted, failures, credentials.userid, body.fetchedAt ?? new Date().toISOString());
    },
  };
}
