import { describe, expect, it } from 'vitest';
import { createJob, runJob, type EngineDeps } from '../../src/core/bot/engine';
import { decide, MIN_GAP_MS } from '../../src/core/bot/policy';
import { RaadError, type FailureKind, type JobRunner } from '../../src/core/bot/types';

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

function runner(outcomes: (FailureKind | 'ok')[], extra: Partial<JobRunner<object, string>> = {}): JobRunner<object, string> & { calls: number } {
  const r = {
    type: 'test', maxAttempts: 5, timeoutMs: 90_000, calls: 0,
    async attempt() {
      const o = outcomes[r.calls++] ?? 'ok';
      if (o !== 'ok') throw new RaadError(o);
      return 'done';
    },
    ...extra,
  };
  return r;
}

describe('policy', () => {
  it('backs off exponentially with jitter, never below the minimum gap', () => {
    const mid = () => 0.5;
    expect(decide('TRANSIENT', 1, mid)).toEqual({ retry: true, delayMs: 2000 });
    expect(decide('TRANSIENT', 3, mid)).toEqual({ retry: true, delayMs: 8000 });
    expect(decide('TRANSIENT', 10, mid)).toEqual({ retry: true, delayMs: 30000 });
    const low = decide('TRANSIENT', 1, () => 0);
    expect(low.retry && low.delayMs).toBe(MIN_GAP_MS);
    expect(decide('SESSION', 4, mid)).toEqual({ retry: true, delayMs: MIN_GAP_MS });
  });

  it('never retries wrong credentials or business errors', () => {
    expect(decide('CREDENTIALS', 1, Math.random)).toEqual({ retry: false, state: 'needs_input' });
    expect(decide('BUSINESS', 1, Math.random)).toEqual({ retry: false, state: 'failed' });
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
    expect(deps.slept).toEqual([2000, 4000]);
    expect(deps.saved).toContain('waiting_retry');
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
    expect(r.calls).toBe(2); // 60â€“70 s wait fits once in 90 s, not twice
  });

  it('retries when the effect cannot be verified', async () => {
    const deps = fakeDeps();
    let checks = 0;
    const r = runner(['ok', 'ok'], { verify: async () => ++checks > 1 });
    const job = await start(r, deps);
    expect(job.state).toBe('succeeded');
    expect(checks).toBe(2);
    expect(deps.saved).toContain('verifying');
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
    const r: JobRunner<object, string> = { type: 't', maxAttempts: 1, timeoutMs: 1000, async attempt(_p, ctx) { ctx.step('SIGN IN', 'ok', { ms: 800 }); return 'x'; } };
    const job = await start(r, deps);
    expect(job.steps).toMatchObject([{ label: 'SIGN IN', status: 'ok', ms: 800 }]);
  });
});
