// The application layer, with a memory store, the real WebCrypto sealer and
// fake sources: no browser, no network.
import { describe, expect, it } from 'vitest';
import type { EngineDeps } from '../../raad/engine/engine';
import { RaadError } from '../../raad/engine/types';
import { createSealer, isSealed } from '../../src/adapters/browser/sealer';
import { createDemoSource, demoHistory, demoResult } from '../../src/adapters/sources/demo/source';
import { createPortal, type Mode } from '../../src/app/portal';
import { BMC } from '../../src/institutions/bmc';
import type { ServerStatus } from '../../src/ports/raad';
import type { StudentDataSource } from '../../src/ports/source';
import type { KeyValueStore } from '../../src/ports/storage';

const NOW = new Date(2026, 9, 22, 10, 15);

function memoryStore(): KeyValueStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T>(k: string) => map.get(k) as T | undefined,
    set: async (k, v) => { map.set(k, v); },
    del: async k => { map.delete(k); },
    clear: async () => { map.clear(); },
  };
}

const engine: EngineDeps = { now: () => NOW, random: () => 0.5, sleep: async () => {}, id: () => crypto.randomUUID() };

/** A live source that answers like the demo, or fails as told. */
function liveSource(fail?: RaadError) {
  const calls: (string | undefined)[] = [];
  const source: StudentDataSource = {
    manifest: { ...createDemoSource().manifest, id: 'fake', credentials: 'password', tier: 'D' },
    async sync(ctx) {
      calls.push(ctx.credentials?.pwd);
      if (fail) throw fail;
      ctx.step('signin', 'ok');
      return demoResult(NOW);
    },
  };
  return { source, calls };
}

function setup(o: { fail?: RaadError; server?: ServerStatus; store?: ReturnType<typeof memoryStore>; forget?: (userid: string) => void } = {}) {
  const store = o.store ?? memoryStore();
  const live = liveSource(o.fail);
  const portal = createPortal({
    store,
    sealer: createSealer(store),
    institution: BMC,
    sourceFor: (m: Mode) => (m === 'demo' ? createDemoSource(() => NOW) : live.source),
    demoHistory: () => demoHistory(NOW),
    server: o.server || o.forget ? { status: async () => o.server, forget: o.forget } : undefined,
    engine,
    online: () => true,
  });
  return { portal, store, live };
}

describe('portal', () => {
  it('forgets a saved password the college refused, so it is never sent again', async () => {
    const store = memoryStore();
    const first = setup({ store });
    await first.portal.init();
    await first.portal.signIn({ userid: '2000', pwd: 'old' }, true);
    expect(store.map.has('credentials')).toBe(true);
    // The student changed the password elsewhere; the saved one is now refused.
    const later = setup({ store, fail: new RaadError('CREDENTIALS') });
    await later.portal.init();
    expect(later.portal.state.hasCredentials).toBe(true);
    const job = await later.portal.sync();
    expect(job.state).toBe('needs_input');
    expect(later.live.calls).toEqual(['old']);
    expect(store.map.has('credentials')).toBe(false);
    expect(later.portal.state.hasCredentials).toBe(false);
    // Opening the app again sends nothing.
    later.portal.refreshIfStale();
    await later.portal.sync().catch(() => undefined);
    expect(later.live.calls).toEqual(['old', undefined]);
    // The data stays on the device until the student signs in again.
    expect(later.portal.state.snapshot?.courses.length).toBe(6);
  });

  it('on opening, reads only what is due', async () => {
    const { portal } = setup();
    await portal.init();
    await portal.signIn({ userid: '2000', pwd: 'secret' }, false);
    const areas: unknown[] = [];
    const store = memoryStore();
    const due = createPortal({
      store, sealer: createSealer(store), institution: BMC, engine, online: () => true,
      sourceFor: () => ({ manifest: { ...createDemoSource().manifest, id: 'fake' }, async sync(ctx) { areas.push(ctx.areas); return demoResult(NOW); } }),
    });
    await due.init();
    await due.signIn({ userid: '2000', pwd: 'secret' }, false);
    expect(areas).toEqual([undefined]); // signing in reads everything
    due.refreshIfStale();
    await new Promise(r => setTimeout(r, 0));
    expect(areas).toHaveLength(1); // just fetched: nothing is due
  });

  it('after a failure of its own, does not try again by itself at once', async () => {
    const { portal, live } = setup({ fail: new RaadError('UNEXPECTED', 'BLOCKED') });
    await portal.init();
    await portal.startDemo();
    await portal.exitDemo();
    expect(await portal.signIn({ userid: '2000', pwd: 'secret' }, false)).toBe('UNEXPECTED');
    expect(live.calls).toHaveLength(1);
    portal.refreshIfStale();
    await new Promise(r => setTimeout(r, 0));
    expect(live.calls).toHaveLength(1);
  });

  it('starts with nobody signed in, the institution’s limit and the identity’s theme', async () => {
    const { portal } = setup();
    await portal.init();
    expect(portal.state).toMatchObject({ ready: true, mode: undefined, snapshot: undefined, hasCredentials: false });
    expect(portal.state.prefs).toMatchObject({ absenceLimit: 25, theme: 'light', lang: 'ar' });
  });

  it('signs in, keeps the data sealed, and remembers the password only when asked', async () => {
    const { portal, store, live } = setup();
    await portal.init();
    expect(await portal.signIn({ userid: '2000', pwd: 'secret' }, false)).toBeUndefined();
    expect(live.calls).toEqual(['secret']);
    expect(portal.state.mode).toBe('live');
    expect(portal.state.snapshot?.courses.length).toBe(6);
    expect(isSealed(store.map.get('snapshot'))).toBe(true);
    expect(store.map.has('credentials')).toBe(false);
    // Nothing personal sits in plain storage.
    const plain = JSON.stringify([...store.map].filter(([, v]) => !isSealed(v)), (_k, v) => (v instanceof Uint8Array || v instanceof ArrayBuffer ? '' : v));
    expect(plain).not.toContain('PYBIO');
    expect(plain).not.toContain('secret');

    const again = setup({ store });
    await again.portal.init();
    expect(again.portal.state.snapshot?.courses.length).toBe(6);
    expect(again.portal.state.hasCredentials).toBe(false); // not remembered
  });

  it('a remembered password survives a restart, sealed', async () => {
    const { portal, store } = setup();
    await portal.init();
    await portal.signIn({ userid: '2000', pwd: 'secret' }, true);
    expect(isSealed(store.map.get('credentials'))).toBe(true);
    const again = setup({ store });
    await again.portal.init();
    expect(again.portal.state.hasCredentials).toBe(true);
  });

  it('a wrong password leaves the student signed out', async () => {
    const { portal } = setup({ fail: new RaadError('CREDENTIALS') });
    await portal.init();
    expect(await portal.signIn({ userid: '2000', pwd: 'nope' }, true)).toBe('CREDENTIALS');
    expect(portal.state).toMatchObject({ mode: undefined, snapshot: undefined, hasCredentials: false });
  });

  it('records Raad’s steps, including the ones on the device', async () => {
    const { portal } = setup();
    await portal.init();
    await portal.signIn({ userid: '2000', pwd: 'secret' }, false);
    const job = portal.state.jobs[0]!;
    expect(job.state).toBe('succeeded');
    expect(job.steps.map(s => `${s.key}:${s.status}`)).toEqual(['signin:ok', 'merge:start', 'merge:ok', 'save:start', 'save:ok']);
    expect(job.result).toMatchObject({ changes: 0, failed: 0 });
  });

  it('does not reach the college while the owner paused Raad', async () => {
    const { portal, live } = setup({ server: { paused: true, message: { ar: 'صيانة' } } });
    await portal.init();
    expect(portal.state.server?.paused).toBe(true);
    expect(await portal.signIn({ userid: '2000', pwd: 'secret' }, false)).toBe('PAUSED');
    expect(live.calls).toEqual([]);
  });

  it('the demo shows its news, and never replaces a live session', async () => {
    const { portal, store } = setup();
    await portal.init();
    await portal.signIn({ userid: '2000', pwd: 'secret' }, true);
    const live = portal.state.snapshot;

    await portal.startDemo();
    expect(portal.state.mode).toBe('demo');
    expect(portal.state.snapshot?.changes.length).toBeGreaterThan(0);
    expect(store.map.get('mode')).toBe('live');

    await portal.exitDemo();
    expect(portal.state.mode).toBe('live');
    expect(portal.state.snapshot).toEqual(live);
    expect(portal.state.hasCredentials).toBe(true);
    expect(store.map.has('demo:snapshot')).toBe(false);
  });

  it('signing out erases everything but the preferences', async () => {
    const { portal, store } = setup();
    await portal.init();
    await portal.setPrefs({ lang: 'en', welcomed: true });
    await portal.signIn({ userid: '2000', pwd: 'secret' }, true);
    await portal.signOut();
    expect(portal.state).toMatchObject({ mode: undefined, snapshot: undefined, jobs: [], hasCredentials: false });
    expect([...store.map.keys()]).toEqual(['prefs']);
    expect(store.map.get('prefs')).toMatchObject({ lang: 'en', welcomed: true });
    // A new sign-in after that works, with a new key.
    await portal.signIn({ userid: '2000', pwd: 'secret' }, true);
    const again = setup({ store });
    await again.portal.init();
    expect(again.portal.state.snapshot?.courses.length).toBe(6);
  });

  it('signing out lets the student’s pseudonym go from the owner’s statistics, never for the demo', async () => {
    const gone: string[] = [];
    const store = memoryStore();
    const { portal } = setup({ store, forget: u => gone.push(u) });
    await portal.init();
    await portal.startDemo();
    await portal.signOut();
    expect(gone).toEqual([]);
    await portal.signIn({ userid: '2000', pwd: 'secret' }, false);
    await portal.signOut();
    expect(gone).toEqual(['2000']);
    // Not remembered, and the app opened again: the ID on the record stands in.
    await portal.signIn({ userid: '2000', pwd: 'secret' }, false);
    const later = setup({ store, forget: u => gone.push(u) });
    await later.portal.init();
    const id = later.portal.state.snapshot?.student?.id;
    expect(id).toBeTruthy();
    await later.portal.signOut();
    expect(gone).toEqual(['2000', id]);
  });
});
