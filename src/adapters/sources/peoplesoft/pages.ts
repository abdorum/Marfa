// The PeopleSoft page allowlist, shared by Raad's server and the browser.
// Where an institution's PeopleSoft lives is in its profile, not here.
//
// ⚠ Requesting a component the student is not authorized for ends the whole
// PeopleSoft session (Docs/10-peoplesoft-notes.md). Never add a page here
// before checking it in an isolated session. Order matters: least certain last.
import type { DataArea } from '../../../core/model';

export const PAGES = {
  center: { component: 'SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL', areas: ['student', 'schedule', 'notices'] },
  grades: { component: 'SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL', areas: ['grades'] },
  // A custom page, not PeopleSoft's own: only institutions that list it in their profile ask for it.
  attendance: { component: 'A_AD_MENU.A_SLF_ATT.GBL', areas: ['attendance'] },
  exams: { component: 'SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL', areas: ['exams'] },
} as const satisfies Record<string, { component: string; areas: readonly DataArea[] }>;

export type PageKey = keyof typeof PAGES;
export const PAGE_KEYS = Object.keys(PAGES) as PageKey[];

export const isPageKey = (k: unknown): k is PageKey => typeof k === 'string' && Object.hasOwn(PAGES, k);

/** The pages that hold these areas, in allowlist order. */
export const pagesFor = (areas: readonly DataArea[], among: readonly PageKey[] = PAGE_KEYS): PageKey[] =>
  among.filter(k => PAGES[k].areas.some(a => areas.includes(a)));

/**
 * Failure codes the server reports per page and per request.
 * - BAD_CREDENTIALS: the sign-in page came back, so the college refused the password.
 * - ACCOUNT: it refused the account for a reason it stated (locked, disabled, expired).
 * - BLOCKED: the college firewall refused the server itself (HTTP 403), not the student.
 * - UPSTREAM: anything the college said that we do not recognize, never the student's fault.
 */
export type PsCode = 'BAD_CREDENTIALS' | 'ACCOUNT' | 'SESSION_EXPIRED' | 'NOT_AUTHORIZED' | 'TIMEOUT' | 'UPSTREAM' | 'BLOCKED';

/** Where an institution's PeopleSoft lives, from its profile, and how Raad introduces himself. */
export interface PsConfig {
  base: string;
  site: string;
  /** As PeopleSoft's sign-in form expects it: minutes behind UTC ("-180" for Riyadh). */
  timezoneOffset: string;
  userAgent: string;
  /** The pages this institution has, in allowlist order. */
  pages: readonly PageKey[];
}

export interface ServerStep {
  label: string;
  ok: boolean;
  ms: number;
  note?: string;
}

/** POST /api/v1/sync response. */
export interface SyncResponse {
  pages: Partial<Record<PageKey, string>>;
  errors: Partial<Record<PageKey, PsCode>>;
  log: ServerStep[];
  fetchedAt: string;
}
