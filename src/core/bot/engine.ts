// Raad's engine: runs a job attempt by attempt until it succeeds, hits a
// failure that must not be retried, runs out of attempts, or passes its
// deadline. Every state change is saved, so a job can resume after the app
// was closed.
import { decide } from './policy';
import { RaadError, TERMINAL_STATES, type AttemptContext, type Job, type JobRunner, type JobState, type StepEvent } from './types';

export interface EngineDeps {
  now(): Date;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  random(): number;
  save?(job: Job<any, any>): void | Promise<void>;
  id?(): string;
}

export const realDeps: EngineDeps = {
  now: () => new Date(),
  random: Math.random,
  sleep: (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new RaadError('CANCELLED')); }, { once: true });
  }),
  id: () => crypto.randomUUID(),
};

export function createJob<P, R>(runner: JobRunner<P, R>, params: P, deps: EngineDeps, idempotencyKey?: string): Job<P, R> {
  const now = deps.now();
  const id = deps.id?.() ?? `${now.getTime()}-${Math.floor(deps.random() * 1e9)}`;
  return {
    id,
    type: runner.type,
    params,
    state: 'queued',
    attempt: 0,
    maxAttempts: runner.maxAttempts,
    deadline: new Date(now.getTime() + runner.timeoutMs).toISOString(),
    idempotencyKey: idempotencyKey ?? id,
    steps: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export const isTerminal = (job: Job<any, any>) => TERMINAL_STATES.includes(job.state);

export function toRaadError(e: unknown): RaadError {
  if (e instanceof RaadError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new RaadError('CANCELLED');
  return new RaadError('UNEXPECTED', e instanceof Error ? e.message : String(e));
}

export async function runJob<P, R>(
  job: Job<P, R>, runner: JobRunner<P, R>, deps: EngineDeps, signal: AbortSignal = new AbortController().signal,
): Promise<Job<P, R>> {
  const save = async (state?: JobState) => {
    if (state) job.state = state;
    job.updatedAt = deps.now().toISOString();
    await deps.save?.(job);
  };
  const step: AttemptContext['step'] = (label, status, extra) => {
    const e: StepEvent = { at: deps.now().toISOString(), label, status, ...extra };
    job.steps.push(e);
    void deps.save?.(job);
  };

  while (!isTerminal(job)) {
    if (signal.aborted) {
      job.failure = { kind: 'CANCELLED', message: 'CANCELLED' };
      await save('cancelled');
      break;
    }
    job.attempt += 1;
    await save('running');
    const ctx: AttemptContext = { attempt: job.attempt, signal, step };
    try {
      const result = await runner.attempt(job.params, ctx);
      if (runner.verify) {
        await save('verifying');
        if (!(await runner.verify(job.params, result, ctx))) throw new RaadError('VERIFY');
      }
      job.result = result;
      job.failure = undefined;
      await save('succeeded');
    } catch (e) {
      const err = toRaadError(signal.aborted ? new RaadError('CANCELLED') : e);
      const decision = decide(err.kind, job.attempt, deps.random);
      job.failure = { kind: err.kind, message: err.message };
      if (!decision.retry) {
        await save(decision.state);
        break;
      }
      const resumeAt = deps.now().getTime() + decision.delayMs;
      if (job.attempt >= job.maxAttempts || resumeAt > Date.parse(job.deadline)) {
        await save('failed');
        break;
      }
      await save('waiting_retry');
      try {
        await deps.sleep(decision.delayMs, signal);
      } catch {
        job.failure = { kind: 'CANCELLED', message: 'CANCELLED' };
        await save('cancelled');
      }
    }
  }
  return job;
}
