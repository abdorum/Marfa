// The PeopleSoft page allowlist, shared by Raad's server and the browser.
//
// ⚠ Requesting a component the student is not authorized for ends the whole
// PeopleSoft session (Docs/10-peoplesoft-notes.md). Never add a page here
// before checking it in an isolated session. Order matters: least certain last.
import type { DataArea } from '../../../core/model';

export const PS_BASE = 'https://sis.bmc.edu.sa';
export const PS_SITE = 'hp';

export const PAGES = {
  center: { component: 'SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL', areas: ['student', 'schedule', 'notices'] },
  grades: { component: 'SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL', areas: ['grades'] },
  attendance: { component: 'A_AD_MENU.A_SLF_ATT.GBL', areas: ['attendance'] },
  exams: { component: 'SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL', areas: ['exams'] },
} as const satisfies Record<string, { component: string; areas: readonly DataArea[] }>;

export type PageKey = keyof typeof PAGES;
export const PAGE_KEYS = Object.keys(PAGES) as PageKey[];

export const isPageKey = (k: unknown): k is PageKey => typeof k === 'string' && Object.hasOwn(PAGES, k);

/**
 * Failure codes the server reports per page and per request. BLOCKED: the
 * college firewall refused the server itself (HTTP 403), not the student.
 */
export type PsCode = 'BAD_CREDENTIALS' | 'SESSION_EXPIRED' | 'NOT_AUTHORIZED' | 'TIMEOUT' | 'UPSTREAM' | 'BLOCKED';

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
