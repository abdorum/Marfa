// Raad's vocabulary: jobs, their states, the steps he reports as he works, and
// the kinds of failure he knows how to handle (Docs/08-bot-spec.md). Raad only
// reads, so there is nothing to verify after a job (ADR-020).
import type { DataArea } from '../../src/core/model';

export type JobState = 'queued' | 'running' | 'waiting_retry' | 'succeeded' | 'failed' | 'needs_input' | 'cancelled';

export const TERMINAL_STATES: readonly JobState[] = ['succeeded', 'failed', 'needs_input', 'cancelled'];

export type FailureKind =
  | 'SESSION'      // the source's session is gone: start a fresh one
  | 'TRANSIENT'    // timeout, network, 5xx: wait and retry
  | 'RATE_LIMIT'   // we were asked to slow down
  | 'CREDENTIALS'  // wrong ID or password: never retry
  | 'PAUSED'       // the owner paused Raad's server: never retry
  | 'UNEXPECTED'   // a page we do not understand
  | 'CANCELLED';

export class RaadError extends Error {
  constructor(public kind: FailureKind, message: string = kind, public detail?: string) {
    super(message);
    this.name = 'RaadError';
  }
}

/**
 * What Raad is doing, told to the student as it happens (transparency):
 * connect → signin → fetch (per data area) → signout → extract → merge → save.
 * `wait` is a pause before another attempt; `attempt` starts one.
 */
export type StepKey = 'connect' | 'signin' | 'fetch' | 'signout' | 'extract' | 'merge' | 'save' | 'wait' | 'attempt';

export interface StepEvent {
  at: string;
  key: StepKey;
  status: 'start' | 'ok' | 'fail' | 'info';
  ms?: number;
  /** A machine-readable detail: an error code, a page name. Never personal data. */
  note?: string;
  /** For `fetch`: the data areas being read. */
  areas?: DataArea[];
}

export interface Job<P = unknown, R = unknown> {
  id: string;
  type: string;
  params: P;
  state: JobState;
  attempt: number;
  maxAttempts: number;
  /** ISO time after which no new attempt starts. */
  deadline: string;
  idempotencyKey: string;
  steps: StepEvent[];
  result?: R;
  failure?: { kind: FailureKind; message: string };
  createdAt: string;
  updatedAt: string;
}

export interface AttemptContext {
  attempt: number;
  signal: AbortSignal;
  step(key: StepKey, status: StepEvent['status'], extra?: Pick<StepEvent, 'ms' | 'note' | 'areas'>): void;
}

/** One kind of work Raad can do. `attempt` is a single try; the engine owns retrying. */
export interface JobRunner<P, R> {
  type: string;
  maxAttempts: number;
  timeoutMs: number;
  attempt(params: P, ctx: AttemptContext): Promise<R>;
}
