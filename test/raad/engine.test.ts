import { describe, expect, it } from 'vitest';
import { createJob, runJob, type EngineDeps } from '../../raad/engine/engine';
import { decide, MIN_GAP_MS } from '../../raad/engine/policy';
import { RaadError, type FailureKind, type JobRunner } from '../../raad/engine/types';

/** Virtual clock: sleeping just moves time forward. */
function fakeDeps(): EngineDeps & { slept: number[]; saved: string[] } {
  let t = Date.parse('2026-10-22T10:00:00Z');
  const slept: number[] = [];
  const saved: string[] = [];
  return {
    slept, saved,
    now: () => new Date(t),
    random: () => 0.5,
    sleep: async (ms, signal) => { if (signal.aborted) throw new RaadError('CANCELLED'); slept.push(ms); t += ms; },
    save: job => { saved.push(job.state); },
    id: () => 'job-1',
  };
}

function runner(outcomes: (FailureKind | 'ok')[]): JobRunner<object, string> & { calls: number } {
  const r = {
    type: 'test', maxAttempts: 5, timeoutMs: 90_000, calls: 0,
    async attempt() {
      const o = outcomes[r.calls++] ?? 'ok';
      if (o !== 'ok') throw new RaadError(o);
      return 'done';
    },
  };
  return r;
}

describe('policy', () => {
  it('backs off exponentially with jitter, for a lost session as for a network failure', () => {
    const mid = () => 0.5;
    expect(decide('TRANSIENT', 1, mid)).toEqual({ retry: true, delayMs: 5000 });
    expect(decide('TRANSIENT', 3, mid)).toEqual({ retry: true, delayMs: 20000 });
    expect(decide('TRANSIENT', 10, mid)).toEqual({ retry: true, delayMs: 30000 });
    const low = decide('TRANSIENT', 1, () => 0);
    expect(low.retry && low.delayMs).toBe(3750);
    expect(low.retry && low.delayMs).toBeGreaterThanOrEqual(MIN_GAP_MS);
    expect(decide('SESSION', 1, mid)).toEqual({ retry: true, delayMs: 5000 });
    expect(decide('SESSION', 2, mid)).toEqual({ retry: true, delayMs: 10000 });
  });

  it('never retries wrong credentials, a pause by the owner, or the unexpected', () => {
    expect(decide('CREDENTIALS', 1, Math.random)).toEqual({ retry: false, state: 'needs_input' });
    expect(decide('PAUSED', 1, Math.random)).toEqual({ retry: false, state: 'failed' });
    expect(decide('UNEXPECTED', 1, Math.random)).toEqual({ retry: false, state: 'failed' });
  });
});

describe('engine', () => {
  const start = (r: JobRunner<object, string>, deps: EngineDeps) => runJob(createJob(r, {}, deps), r, deps);

  it('retries through session and network failures until it succeeds', async () => {
    const deps = fakeDeps();
    const r = runner(['SESSION', 'TRANSIENT', 'ok']);
    const job = await start(r, deps);
    expect(job.state).toBe('succeeded');
    expect(job.result).toBe('done');
    expect(job.attempt).toBe(3);
    expect(job.failure).toBeUndefined();
    expect(deps.slept).toEqual([5000, 10000]);
    expect(deps.saved).toContain('waiting_retry');
    // The student sees the waits and the new attempts.
    expect(job.steps.map(s => `${s.key}:${s.note}`)).toEqual(['wait:SESSION', 'attempt:2', 'wait:TRANSIENT', 'attempt:3']);
  });

  it('stops at once on wrong credentials and asks for input', async () => {
    const deps = fakeDeps();
    const r = runner(['CREDENTIALS']);
    const job = await start(r, deps);
    expect(job.state).toBe('needs_input');
    expect(r.calls).toBe(1);
  });

  it('gives up after the maximum number of attempts', async () => {
    const deps = fakeDeps();
    const r = runner(Array(10).fill('TRANSIENT'));
    const job = await start(r, deps);
    expect(job.state).toBe('failed');
    expect(r.calls).toBe(5);
    expect(job.failure?.kind).toBe('TRANSIENT');
  });

  it('does not start an attempt after the deadline', async () => {
    const deps = fakeDeps();
    const r = runner(Array(10).fill('RATE_LIMIT'));
    const job = await start(r, deps);
    expect(job.state).toBe('failed');
    expect(r.calls).toBe(2); // a 60–70 s wait fits once in 90 s, not twice
  });

  it('can be cancelled while waiting', async () => {
    const deps = fakeDeps();
    const ctrl = new AbortController();
    deps.sleep = async () => { ctrl.abort(); throw new RaadError('CANCELLED'); };
    const r = runner(['TRANSIENT', 'ok']);
    const job = await runJob(createJob(r, {}, deps), r, deps, ctrl.signal);
    expect(job.state).toBe('cancelled');
    expect(r.calls).toBe(1);
  });

  it('records the steps an attempt reports', async () => {
    const deps = fakeDeps();
    const r: JobRunner<object, string> = {
      type: 't', maxAttempts: 1, timeoutMs: 1000,
      async attempt(_p, ctx) { ctx.step('signin', 'start'); ctx.step('signin', 'ok', { ms: 800 }); ctx.step('fetch', 'ok', { areas: ['grades'] }); return 'x'; },
    };
    const job = await start(r, deps);
    expect(job.steps).toMatchObject([{ key: 'signin', status: 'start' }, { key: 'signin', status: 'ok', ms: 800 }, { key: 'fetch', areas: ['grades'] }]);
  });
});
