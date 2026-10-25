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
import type { Snapshot, SyncResult } from '../core/model';
import { lastFetched, mergeSnapshot, migrateSnapshot } from '../core/snapshot';
import type { RaadServer, ServerStatus } from '../ports/raad';
import type { Credentials, StudentDataSource } from '../ports/source';
import type { KeyValueStore, Sealed, Sealer } from '../ports/storage';
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
export type SignInFailure = FailureKind | 'LOCKED';

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
  sync(): Promise<SyncJob>;
  refreshIfStale(): void;
  setPrefs(patch: Partial<Prefs>): Promise<void>;
  checkServer(force?: boolean): Promise<void>;
  setOnline(online: boolean): void;
}

const KEYS = { prefs: 'prefs', mode: 'mode', jobs: 'raad:jobs', credentials: 'credentials' };
const snapshotKey = (m: Mode) => (m === 'demo' ? 'demo:snapshot' : 'snapshot');
const STALE_MS = 15 * 60 * 1000;
const SERVER_CHECK_MS = 5 * 60 * 1000;
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

  const openSnapshot = async (m: Mode) => migrateSnapshot(await d.sealer.open(await d.store.get<Sealed>(snapshotKey(m))));

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

  const sync = (): Promise<SyncJob> => {
    const mode = state.mode;
    if (!mode) return Promise.reject(new Error('no mode'));
    running ??= (async () => {
      const source = d.sourceFor(mode);
      const runner = syncRunner({ source, credentials: mode === 'live' ? credentials : undefined, current: () => state.snapshot, save: s => saveSnapshot(mode, s) });
      const deps: EngineDeps = { ...d.engine, save: j => putJob(j as SyncJob) };
      const started = now().getTime();
      const job = await runJob(createJob(runner, {}, deps), runner, deps);
      putJob(job);
      if (state.prefs.metrics && mode === 'live') d.metrics?.(job, now().getTime() - started);
      if (job.failure?.kind === 'PAUSED') void checkServer(true);
      return job;
    })().finally(() => { running = undefined; });
    return running;
  };

  const refreshIfStale = () => {
    if (!state.mode || !state.hasCredentials || running || !state.online || state.server?.paused) return;
    const at = lastFetched(state.snapshot);
    if (!at || now().getTime() - Date.parse(at) > STALE_MS) void sync();
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
      const [p, m, j] = await Promise.all([d.store.get<Partial<Prefs>>(KEYS.prefs), d.store.get<Mode>(KEYS.mode), d.store.get<SyncJob[]>(KEYS.jobs)]);
      storedMode = m === 'live' || m === 'demo' ? m : undefined;
      const mode = opts.demo ? 'demo' : storedMode;
      const snapshot = mode ? await openSnapshot(mode) : undefined;
      if (mode === 'live') credentials = await d.sealer.open<Credentials>(await d.store.get<Sealed>(KEYS.credentials));
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
        return job.failure?.message === 'LOCKED' ? 'LOCKED' : job.failure?.kind ?? 'UNEXPECTED';
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
        credentials ??= await d.sealer.open<Credentials>(await d.store.get<Sealed>(KEYS.credentials));
        set({ mode: 'live', snapshot: await openSnapshot('live'), hasCredentials: !!credentials });
      } else {
        storedMode = undefined;
        await d.store.del(KEYS.mode);
        set({ mode: undefined, snapshot: undefined, hasCredentials: false });
      }
    },

    async signOut() {
      const prefs = state.prefs;
      clearTimeout(persistTimer);
      await d.store.clear();
      d.sealer.reset();
      credentials = undefined;
      storedMode = undefined;
      set({ mode: undefined, snapshot: undefined, jobs: [], hasCredentials: false });
      await d.store.set(KEYS.prefs, prefs);
    },

    sync,
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
