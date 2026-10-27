// The application: everything a student can do, independent of any UI
// framework. The web UI (src/web) binds this state to its cards; nothing here
// knows about Preact, the DOM, or which source serves the institution.
//
// Everything stays on the device. The snapshot and a remembered password are
// sealed (encrypted at rest); nothing leaves the device except the sign-in
// call Raad makes, and anonymous statistics if the student opts in.
import { createJob, isTerminal, runJob, type EngineDeps } from '../../raad/engine/engine';
import type { FailureKind, Job } from '../../raad/engine/types';
import type { InstitutionProfile } from '../core/institution';
import type { DataArea, Snapshot, SyncResult } from '../core/model';
import { lastFetched, mergeSnapshot, migrateSnapshot } from '../core/snapshot';
import type { RaadServer, ServerStatus } from '../ports/raad';
import type { Credentials, StudentDataSource } from '../ports/source';
import type { KeyValueStore, Sealed, Sealer } from '../ports/storage';
import { dueAreas } from './freshness';
import { syncRunner, type SyncSummary } from './sync';

/** live: the institution's own source. demo: made-up data, never mixed with live data. */
export type Mode = 'live' | 'demo';
export type Theme = 'auto' | 'light' | 'dark';
export type Lang = 'ar' | 'en';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  absenceLimit: number;
  metrics: boolean;
  avatar?: string;
  /** Home cards the student chose to hide. */
  hiddenCards: string[];
  /** The welcome tour was seen. */
  welcomed: boolean;
  /** For "what's new": the version the student last opened. */
  lastSeenVersion?: string;
  /** Changes after this time are new to the student. */
  changesSeenAt?: string;
  installHintDismissed?: boolean;
}

export type SyncJob = Job<Record<string, never>, SyncSummary>;
/** Why a sign-in failed: a failure kind, or one of the reasons the student must read as such. */
export type SignInFailure = FailureKind | 'LOCKED' | 'ACCOUNT' | 'COOLDOWN';
const TOLD_APART: readonly string[] = ['LOCKED', 'ACCOUNT', 'COOLDOWN'];

export interface PortalState {
  ready: boolean;
  mode?: Mode;
  snapshot?: Snapshot;
  jobs: SyncJob[];
  prefs: Prefs;
  /** Raad can sync now: the demo, or a live session with a password in memory. */
  hasCredentials: boolean;
  online: boolean;
  server?: ServerStatus;
}

export interface PortalDeps {
  store: KeyValueStore;
  sealer: Sealer;
  institution: InstitutionProfile;
  sourceFor(mode: Mode): StudentDataSource;
  /** Earlier demo syncs, oldest first, so the demo has news to show. */
  demoHistory?(): SyncResult[];
  server?: RaadServer;
  engine: EngineDeps;
  metrics?(job: SyncJob, durationMs: number): void;
  online(): boolean;
}

export interface Portal {
  readonly state: PortalState;
  subscribe(fn: (s: PortalState) => void): () => void;
  init(opts?: { demo?: boolean }): Promise<void>;
  signIn(c: Credentials, remember: boolean): Promise<SignInFailure | undefined>;
  startDemo(): Promise<void>;
  exitDemo(): Promise<void>;
  signOut(): Promise<void>;
  /** Reads everything now, as the student asked. */
  sync(): Promise<SyncJob>;
  /** Reads what is due, after a short random pause; nothing if nothing is due. */
  refreshIfStale(): void;
  setPrefs(patch: Partial<Prefs>): Promise<void>;
  checkServer(force?: boolean): Promise<void>;
  setOnline(online: boolean): void;
}

const KEYS = { prefs: 'prefs', mode: 'mode', jobs: 'raad:jobs', credentials: 'credentials' };
const snapshotKey = (m: Mode) => (m === 'demo' ? 'demo:snapshot' : 'snapshot');
const STALE_MS = 15 * 60 * 1000;
const SERVER_CHECK_MS = 5 * 60 * 1000;
/** After a sync that failed on its own, the app waits this long before trying again by itself. */
const AFTER_FAILURE_MS = 10 * 60 * 1000;
/** A refresh on opening waits up to this long, so students opening at the same minute are spread apart. */
const OPEN_SPREAD_MS = 8000;
const MAX_JOBS = 30;

export const defaultPrefs = (i: InstitutionProfile): Prefs =>
  ({ lang: 'ar', theme: 'light', absenceLimit: i.absenceLimit, metrics: false, hiddenCards: [], welcomed: false });

export function createPortal(d: PortalDeps): Portal {
  let state: PortalState = { ready: false, jobs: [], prefs: defaultPrefs(d.institution), hasCredentials: false, online: d.online() };
  let credentials: Credentials | undefined;
  let storedMode: Mode | undefined;
  let running: Promise<SyncJob> | undefined;
  let lastServerCheck = 0;
  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(s: PortalState) => void>();
  const now = () => d.engine.now();

  const set = (patch: Partial<PortalState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };

  /** A read that may fail (storage trouble) without stopping the app; the data then shows as missing. */
  const read = <T>(p: Promise<T>) => p.catch(() => undefined);
  const openSnapshot = (m: Mode) => read((async () => migrateSnapshot(await d.sealer.open(await d.store.get<Sealed>(snapshotKey(m)))))());
  const openCredentials = () => read((async () => d.sealer.open<Credentials>(await d.store.get<Sealed>(KEYS.credentials)))());

  const saveSnapshot = async (m: Mode, s: Snapshot) => {
    if (state.mode === m) set({ snapshot: s });
    await d.store.set(snapshotKey(m), await d.sealer.seal(s));
  };

  const putJob = (j: SyncJob) => {
    const copy = { ...j, steps: [...j.steps] };
    set({ jobs: [copy, ...state.jobs.filter(x => x.id !== j.id)].slice(0, MAX_JOBS) });
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void d.store.set(KEYS.jobs, state.jobs), 300);
  };

  /**
   * A password the college refused is forgotten at once: kept, it would be
   * sent again at every opening, and could lock the student's real account.
   */
  const forgetCredentials = async () => {
    credentials = undefined;
    set({ hasCredentials: false });
    await d.store.del(KEYS.credentials);
  };

  const sync = (areas?: readonly DataArea[]): Promise<SyncJob> => {
    const mode = state.mode;
    if (!mode) return Promise.reject(new Error('no mode'));
    running ??= (async () => {
      const source = d.sourceFor(mode);
      const runner = syncRunner({ source, credentials: mode === 'live' ? credentials : undefined, areas, current: () => state.snapshot, save: s => saveSnapshot(mode, s) });
      const deps: EngineDeps = { ...d.engine, save: j => putJob(j as SyncJob) };
      const started = now().getTime();
      const job = await runJob(createJob(runner, {}, deps), runner, deps);
      putJob(job);
      if (job.state === 'needs_input' && mode === 'live') await forgetCredentials();
      if (state.prefs.metrics && mode === 'live') d.metrics?.(job, now().getTime() - started);
      if (job.failure?.kind === 'PAUSED') void checkServer(true);
      return job;
    })().finally(() => { running = undefined; });
    return running;
  };

  const staleMs = () => (state.server?.staleMinutes ?? 0) * 60_000 || STALE_MS;

  /** The app may refresh on its own: signed in, online, Raad working, and no failure just now. */
  const mayRefresh = () => {
    if (!state.mode || !state.hasCredentials || running || !state.online || state.server?.paused) return false;
    const last = state.jobs[0];
    return !(last?.state === 'failed' && now().getTime() - Date.parse(last.updatedAt) < AFTER_FAILURE_MS);
  };

  let spreading = false;
  const refreshIfStale = () => {
    if (spreading || !mayRefresh()) return;
    if (!lastFetched(state.snapshot)) {
      void sync();
      return;
    }
    if (!dueAreas(state.snapshot, now().getTime(), staleMs()).length) return;
    spreading = true;
    void d.engine.sleep(Math.round(d.engine.random() * OPEN_SPREAD_MS), new AbortController().signal)
      .then(() => {
        const due = dueAreas(state.snapshot, now().getTime(), staleMs());
        if (due.length && mayRefresh()) void sync(due);
      })
      .finally(() => { spreading = false; });
  };

  const checkServer = async (force = false) => {
    const t = now().getTime();
    if (!d.server || (!force && t - lastServerCheck < SERVER_CHECK_MS)) return;
    lastServerCheck = t;
    const s = await d.server.status();
    if (s) set({ server: s });
  };

  const seedDemo = async () => {
    let s: Snapshot | undefined;
    for (const r of d.demoHistory?.() ?? []) s = mergeSnapshot(s, r, 'demo');
    if (s) await saveSnapshot('demo', s);
  };

  return {
    get state() { return state; },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async init(opts = {}) {
      const [p, m, j] = await Promise.all([read(d.store.get<Partial<Prefs>>(KEYS.prefs)), read(d.store.get<Mode>(KEYS.mode)), read(d.store.get<SyncJob[]>(KEYS.jobs))]);
      storedMode = m === 'live' || m === 'demo' ? m : undefined;
      const mode = opts.demo ? 'demo' : storedMode;
      const snapshot = mode ? await openSnapshot(mode) : undefined;
      if (mode === 'live') credentials = await openCredentials();
      set({
        ready: true,
        prefs: { ...defaultPrefs(d.institution), ...p },
        mode,
        snapshot,
        // A job interrupted by closing the app is marked so; syncs simply run again.
        jobs: (j ?? []).map(x => (isTerminal(x) ? x : { ...x, state: 'cancelled', failure: { kind: 'CANCELLED', message: 'INTERRUPTED' } })),
        hasCredentials: mode === 'demo' || !!credentials,
      });
      if (mode === 'demo') {
        // A visit to the demo never replaces a live session.
        if (storedMode !== 'live') await d.store.set(KEYS.mode, 'demo');
        if (!snapshot) await seedDemo();
      }
      void checkServer(true);
      refreshIfStale();
    },

    async signIn(c, remember) {
      if (state.server?.paused) return 'PAUSED';
      // Signing in again from Raad's page keeps what is already on the device.
      const keep = state.mode === 'live' && !!state.snapshot;
      credentials = c;
      set({ mode: 'live', hasCredentials: true, snapshot: keep ? state.snapshot : undefined });
      const job = await sync();
      if (job.state !== 'succeeded') {
        credentials = undefined;
        set(keep ? { hasCredentials: false } : { mode: storedMode === 'live' ? 'live' : undefined, hasCredentials: false });
        const message = job.failure?.message ?? '';
        return TOLD_APART.includes(message) ? message as SignInFailure : job.failure?.kind ?? 'UNEXPECTED';
      }
      storedMode = 'live';
      await d.store.set(KEYS.mode, 'live');
      if (remember) await d.store.set(KEYS.credentials, await d.sealer.seal(c));
      return undefined;
    },

    async startDemo() {
      set({ mode: 'demo', hasCredentials: true, snapshot: await openSnapshot('demo') });
      if (storedMode !== 'live') { storedMode = 'demo'; await d.store.set(KEYS.mode, 'demo'); }
      if (!state.snapshot) await seedDemo();
      await sync();
    },

    async exitDemo() {
      await d.store.del(snapshotKey('demo'));
      if (storedMode === 'live') {
        credentials ??= await openCredentials();
        set({ mode: 'live', snapshot: await openSnapshot('live'), hasCredentials: !!credentials });
      } else {
        storedMode = undefined;
        await d.store.del(KEYS.mode);
        set({ mode: undefined, snapshot: undefined, hasCredentials: false });
      }
    },

    async signOut() {
      const prefs = state.prefs;
      // The owner's statistics know a student who signed in only by a pseudonym; it goes too.
      if (storedMode === 'live' || state.mode === 'live') {
        const userid = (credentials ?? await openCredentials())?.userid ?? (state.mode === 'live' ? state.snapshot?.student?.id : undefined);
        if (userid) d.server?.forget?.(userid);
      }
      clearTimeout(persistTimer);
      await d.store.clear();
      d.sealer.reset();
      credentials = undefined;
      storedMode = undefined;
      set({ mode: undefined, snapshot: undefined, jobs: [], hasCredentials: false });
      await d.store.set(KEYS.prefs, prefs);
    },

    sync: () => sync(),
    refreshIfStale,
    checkServer,

    async setPrefs(patch) {
      set({ prefs: { ...state.prefs, ...patch } });
      await d.store.set(KEYS.prefs, state.prefs);
    },

    setOnline(online) {
      set({ online });
      if (online) refreshIfStale();
    },
  };
}
