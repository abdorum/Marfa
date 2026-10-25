// The composition root: the application (src/app) wired to this browser's
// adapters, and its state as Preact signals for the cards. The only file in
// the UI that knows which adapters exist.
import { computed, effect, signal } from '@preact/signals';
import { isTerminal, realDeps } from '../../raad/engine/engine';
import type { StepEvent } from '../../raad/engine/types';
import { sendMetrics } from '../adapters/browser/metrics';
import { createRaadServer } from '../adapters/browser/raad-server';
import { createSealer } from '../adapters/browser/sealer';
import { askPersistence, createDeviceStore } from '../adapters/browser/store';
import { createSource, demoHistory } from '../adapters/sources';
import type { Extracted } from '../adapters/sources/peoplesoft/map';
import type { SyncResponse } from '../adapters/sources/peoplesoft/pages';
import { createPortal, type Mode, type PortalState, type Prefs } from '../app/portal';
import { PRODUCT } from '../app/product';
import { courseColors } from '../core/derive';
import { lastFetched } from '../core/snapshot';
import { INSTITUTION } from '../institutions';
import type { Credentials } from '../ports/source';
import { COURSE_COLORS } from './colors';
import { applyDocumentLang, lang } from './i18n';

/** Dev only (`npm run dev`, /?capture): saves anonymized pages as test fixtures. */
function devCapture(pages: SyncResponse['pages'], x: Extracted, cred: Credentials) {
  void fetch('/dev/capture', {
    method: 'POST',
    body: JSON.stringify({
      pages,
      person: { userid: cred.userid, nameAr: x.grades?.nameAr, nameEn: x.attendance?.nameEn, email: x.center?.email, phone: x.center?.phone, firstName: x.center?.firstName },
    }),
  }).then(r => r.json()).then(r => console.info('capture', r));
}

const capture = import.meta.env.DEV && new URLSearchParams(location.search).has('capture');
const store = createDeviceStore();

export const portal = createPortal({
  store,
  sealer: createSealer(store),
  institution: INSTITUTION,
  sourceFor: (m: Mode) => createSource(m === 'demo' ? 'demo' : INSTITUTION.source, { institution: INSTITUTION, onRaw: capture ? devCapture : undefined }),
  demoHistory: () => demoHistory(new Date()),
  server: createRaadServer(),
  engine: realDeps,
  metrics: (job, ms) => sendMetrics(job, ms, PRODUCT.version),
  online: () => navigator.onLine,
});

const state = signal<PortalState>(portal.state);
portal.subscribe(s => { state.value = s; });

export const ready = computed(() => state.value.ready);
export const mode = computed(() => state.value.mode);
export const snapshot = computed(() => state.value.snapshot);
export const jobs = computed(() => state.value.jobs);
export const prefs = computed(() => state.value.prefs);
export const online = computed(() => state.value.online);
export const server = computed(() => state.value.server);
export const hasCredentials = computed(() => state.value.hasCredentials);
/** Signed in once there is data to show; during the first sign-in the form stays up. */
export const signedIn = computed(() => !!state.value.mode && !!state.value.snapshot);
export const activeJob = computed(() => state.value.jobs.find(j => !isTerminal(j)));
export const lastJob = computed(() => state.value.jobs[0]);
export const lastUpdated = computed(() => lastFetched(state.value.snapshot));
export const colors = computed(() => courseColors(state.value.snapshot ?? { courses: [], sections: [] }, COURSE_COLORS.length));
export const courseColor = (key: string) => COURSE_COLORS[colors.value.get(key) ?? 0]!;

export type RaadStatus = 'idle' | 'working' | 'retrying' | 'needs' | 'offline' | 'paused';

/** What Raad is doing, for his avatar and status chip. */
export const raadStatus = computed<RaadStatus>(() => {
  if (state.value.server?.paused) return 'paused';
  const j = activeJob.value;
  if (j) return j.state === 'waiting_retry' ? 'retrying' : 'working';
  if (state.value.mode === 'live' && !state.value.hasCredentials) return 'needs';
  if (lastJob.value?.state === 'needs_input') return 'needs';
  if (!state.value.online) return 'offline';
  return 'idle';
});

/**
 * The step to tell the student now (transparency): the newest step that
 * started and has not finished, or a wait, or else the newest step.
 */
export const liveStep = computed<StepEvent | undefined>(() => {
  const j = activeJob.value;
  if (!j) return undefined;
  const steps = j.steps;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!;
    if (s.key === 'wait') return s;
    if (s.status === 'start' && !steps.slice(i + 1).some(x => x.key === s.key && (x.status === 'ok' || x.status === 'fail'))) return s;
  }
  return steps.at(-1) ?? { at: j.createdAt, key: 'connect', status: 'start' };
});

export const setPrefs = (patch: Partial<Prefs>) => portal.setPrefs(patch);

export function applyTheme(theme: Prefs['theme']) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1E2163' : '#6266D8');
}

// Language and theme follow the preferences.
effect(() => {
  const p = state.value.prefs;
  if (lang.peek() !== p.lang) lang.value = p.lang;
  applyDocumentLang();
  applyTheme(p.theme);
});

export async function start() {
  await portal.init({ demo: new URLSearchParams(location.search).has('demo') });
  void askPersistence();
  addEventListener('online', () => portal.setOnline(true));
  addEventListener('offline', () => portal.setOnline(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void portal.checkServer();
    portal.refreshIfStale();
  });
}
