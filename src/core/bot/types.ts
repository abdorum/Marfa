// Raad's vocabulary: jobs, their states, and the kinds of failure it knows
// how to handle (Docs/08-bot-spec.md).

export type JobState =
  | 'queued' | 'running' | 'waiting_retry' | 'verifying'
  | 'succeeded' | 'failed' | 'needs_input' | 'cancelled';

export const TERMINAL_STATES: readonly JobState[] = ['succeeded', 'failed', 'needs_input', 'cancelled'];

export type FailureKind =
  | 'SESSION'      // PeopleSoft session gone: start a fresh one
  | 'TRANSIENT'    // timeout, network, 5xx: wait and retry
  | 'RATE_LIMIT'   // we were asked to slow down
  | 'VERIFY'       // action reported success but the result is not there
  | 'CREDENTIALS'  // wrong ID or password: never retry
  | 'BUSINESS'     // class full, time conflict…: never retry
  | 'UNEXPECTED'   // a page we do not understand
  | 'CANCELLED';

export class RaadError extends Error {
  constructor(public kind: FailureKind, message: string = kind, public detail?: string) {
    super(message);
    this.name = 'RaadError';
  }
}

export interface StepEvent {
  at: string;
  label: string;
  status: 'ok' | 'fail' | 'info';
  ms?: number;
  note?: string;
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
  step(label: string, status: StepEvent['status'], extra?: Pick<StepEvent, 'ms' | 'note'>): void;
}

/** One kind of work Raad can do. `attempt` is a single try; the engine owns retrying. */
export interface JobRunner<P, R> {
  type: string;
  maxAttempts: number;
  timeoutMs: number;
  attempt(params: P, ctx: AttemptContext): Promise<R>;
  /** For actions that write: confirm the effect is really there. */
  verify?(params: P, result: R, ctx: AttemptContext): Promise<boolean>;
}
