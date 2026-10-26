// Raad's vocabulary: jobs and their states (Docs/08-bot-spec.md). The steps
// and failure kinds of one attempt belong to the domain (src/core/attempt.ts),
// since every source speaks them. Raad only reads, so there is nothing to
// verify after a job (ADR-020).
import type { AttemptContext, FailureKind, StepEvent } from '../../src/core/attempt';

export { RaadError, type AttemptContext, type FailureKind, type StepEvent, type StepKey } from '../../src/core/attempt';

export type JobState = 'queued' | 'running' | 'waiting_retry' | 'succeeded' | 'failed' | 'needs_input' | 'cancelled';

export const TERMINAL_STATES: readonly JobState[] = ['succeeded', 'failed', 'needs_input', 'cancelled'];

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

/** One kind of work Raad can do. `attempt` is a single try; the engine owns retrying. */
export interface JobRunner<P, R> {
  type: string;
  maxAttempts: number;
  timeoutMs: number;
  attempt(params: P, ctx: AttemptContext): Promise<R>;
}
