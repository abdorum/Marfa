// Application state: the snapshot, Raad's jobs, preferences and the session.
// Everything is persisted to IndexedDB on the device; nothing leaves it except
// the sign-in call Raad makes.
import { batch, computed, signal } from '@preact/signals';
import { createDemoSource } from '../../adapters/demo/source';
import { createPeopleSoftSource } from '../../adapters/peoplesoft/client';
import type { Credentials, StudentDataSource } from '../../adapters/ports';
import { syncRunner } from '../../app/sync';
import { createJob, isTerminal, realDeps, runJob } from '../../core/bot/engine';
import type { FailureKind, Job } from '../../core/bot/types';
import { avatarFor } from '../../core/derive';
import type { Snapshot, SyncResult } from '../../core/model';
import { mergeSnapshot } from '../../core/snapshot';
import { applyDocumentLang, lang, type Lang } from '../i18n';
import * as db from './db';
import { sendMetrics } from './metrics';
import * as vault from './vault';

export type Mode = 'peoplesoft' | 'demo';
export type Theme = 'auto' | 'light' | 'dark';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  absenceLimit: number;
  metrics: boolean;
  avatar?: string;
}

export const DEFAULT_PREFS: Prefs = { lang: 'ar', theme: 'auto', absenceLimit: 25, metrics: false };
const STALE_MS = 15 * 60 * 1000;
const MAX_JOBS = 50;

type SyncJob = Job<Record<string, never>, SyncResult>;

export const ready = signal(false);
export const mode = signal<Mode | undefined>(undefined);
export const snapshot = signal<Snapshot | undefined>(undefined);
export const jobs = signal<Job<any, any>[]>([]);
export const prefs = signal<Prefs>(DEFAULT_PREFS);
export const avatars = signal<string[]>([]);
export const online = signal(navigator.onLine);
const credentials = signal<Credentials | undefined>(undefined);

// Signed in once there is data to show. During the first sign-in the login
// screen stays up, so a failure is shown there instead of being lost.
export const signedIn = computed(() => mode.value === 'demo' || (!!mode.value && !!snapshot.value));
export const hasCredentials = computed(() => mode.value === 'demo' || !!credentials.value);
export const activeJob = computed(() => jobs.value.find(j => !isTerminal(j)));
export const lastJob = computed(() => jobs.value[0]);
export const avatar = computed(() => prefs.value.avatar ?? avatarFor(snapshot.value?.student?.id ?? '', avatars.value));

/** What Raad's button shows (Docs/06-design-system.md#رعد-في-الواجهة). */
export const raadStatus = computed<'idle' | 'working' | 'retrying' | 'done' | 'needs' | 'offline'>(() => {
  const j = activeJob.value;
  if (j) return j.state === 'waiting_retry' ? 'retrying' : 'working';
  if (lastJob.value?.state === 'needs_input') return 'needs';
  if (!online.value) return 'offline';
  if (lastJob.value?.state === 'succeeded' && Date.now() - Date.parse(lastJob.value.updatedAt) < 2000) return 'done';
  return 'idle';
});

window.addEventListener('online', () => { online.value = true; });
window.addEventListener('offline', () => { online.value = false; });

export function applyTheme(theme: Theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export async function setPrefs(patch: Partial<Prefs>) {
  prefs.value = { ...prefs.value, ...patch };
  if (patch.lang) { lang.value = patch.lang; applyDocumentLang(); }
  if (patch.theme) applyTheme(patch.theme);
  await db.set('prefs', prefs.value);
}

function sourceFor(m: Mode): StudentDataSource {
  if (m === 'demo') return createDemoSource();
  // Dev only (`npm run dev`, /?capture): save anonymized pages as test fixtures.
  const capture = import.meta.env.DEV && new URLSearchParams(location.search).has('capture');
  return createPeopleSoftSource({
    onRaw: capture ? (pages, x, cred) => void fetch('/dev/capture', {
      method: 'POST',
      body: JSON.stringify({
        pages,
        person: { userid: cred.userid, nameAr: x.grades?.nameAr, nameEn: x.attendance?.nameEn, email: x.center?.email, phone: x.center?.phone, firstName: x.center?.firstName },
      }),
    }).then(r => r.json()).then(r => console.info('capture', r)) : undefined,
  });
}

function putJob(j: Job<any, any>) {
  const copy = { ...j, steps: [...j.steps] };
  const rest = jobs.value.filter(x => x.id !== j.id);
  jobs.value = [copy, ...rest].slice(0, MAX_JOBS);
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persistJobs() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void db.set('jobs', jobs.value), 300);
}

let running: Promise<SyncJob> | undefined;

/** Raad's sync job. Only one runs at a time; a second call joins the first. */
export function runSync(): Promise<SyncJob> {
  const m = mode.value;
  if (!m) return Promise.reject(new Error('no mode'));
  running ??= (async () => {
    const source = sourceFor(m);
    const runner = syncRunner(source, credentials.value);
    const deps = { ...realDeps, save: (j: Job<any, any>) => { putJob(j); persistJobs(); } };
    const started = Date.now();
    const job = await runJob(createJob(runner, {}, deps), runner, deps);
    putJob(job);
    persistJobs();
    if (job.state === 'succeeded' && job.result) {
      snapshot.value = mergeSnapshot(snapshot.value, job.result, source.id);
      await db.set('snapshot', snapshot.value);
    }
    if (prefs.value.metrics && m === 'peoplesoft') sendMetrics(job, Date.now() - started);
    return job;
  })().finally(() => { running = undefined; });
  return running;
}

export async function signIn(c: Credentials, remember: boolean): Promise<FailureKind | undefined> {
  batch(() => { credentials.value = c; mode.value = 'peoplesoft'; });
  const job = await runSync();
  if (job.state !== 'succeeded') {
    batch(() => { credentials.value = undefined; mode.value = undefined; });
    return job.failure?.kind ?? 'UNEXPECTED';
  }
  await db.set('mode', 'peoplesoft');
  if (remember) await vault.save(c);
  return undefined;
}

export async function startDemo() {
  mode.value = 'demo';
  await db.set('mode', 'demo');
  await runSync();
}

export async function signOut() {
  await vault.forget();
  await db.clearAll();
  batch(() => {
    credentials.value = undefined;
    mode.value = undefined;
    snapshot.value = undefined;
    jobs.value = [];
  });
  await setPrefs({ ...prefs.value });
}

/** Refresh unless the data is recent or Raad is already at work. */
export function refreshIfStale() {
  const at = Object.values(snapshot.value?.provenance ?? {}).map(p => p?.fetchedAt).filter(Boolean).sort().pop();
  const canRun = mode.value === 'demo' || !!credentials.value;
  if (canRun && !activeJob.value && (!at || Date.now() - Date.parse(at) > STALE_MS)) void runSync();
}

export async function init() {
  const [p, m, s, j] = await Promise.all([db.get<Prefs>('prefs'), db.get<Mode>('mode'), db.get<Snapshot>('snapshot'), db.get<Job<any, any>[]>('jobs')]);
  const wantDemo = new URLSearchParams(location.search).has('demo');
  batch(() => {
    prefs.value = { ...DEFAULT_PREFS, ...p };
    lang.value = prefs.value.lang;
    mode.value = wantDemo ? 'demo' : m;
    snapshot.value = wantDemo && m !== 'demo' ? undefined : s;
    // A job interrupted by closing the app is marked so; sync jobs simply run again.
    jobs.value = (j ?? []).map(x => (isTerminal(x) ? x : { ...x, state: 'cancelled', failure: { kind: 'CANCELLED', message: 'INTERRUPTED' } }));
  });
  applyDocumentLang();
  applyTheme(prefs.value.theme);
  if (mode.value === 'peoplesoft') credentials.value = await vault.load();
  fetch('/avatars.json').then(r => r.json()).then((list: string[]) => { avatars.value = list; }).catch(() => {});
  ready.value = true;
  if (wantDemo && mode.value === 'demo' && !snapshot.value) await db.set('mode', 'demo');
  refreshIfStale();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshIfStale(); });
}
