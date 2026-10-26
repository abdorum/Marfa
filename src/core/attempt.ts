// The vocabulary of one attempt at reading a source: the steps told to the
// student as they happen, and the kinds of failure. It belongs to the domain,
// so the source port and every adapter speak it without depending on Raad's
// engine, which only decides what to do with each kind (raad/engine/policy.ts).
import type { DataArea } from './model';

export type FailureKind =
  | 'SESSION'      // the source's session is gone: start a fresh one
  | 'TRANSIENT'    // timeout, network, 5xx: wait and retry
  | 'RATE_LIMIT'   // we were asked to slow down
  | 'CREDENTIALS'  // wrong ID or password: never retry
  | 'PAUSED'       // the owner paused Raad's server, or it is resting: never retry
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

export interface AttemptContext {
  attempt: number;
  signal: AbortSignal;
  step(key: StepKey, status: StepEvent['status'], extra?: Pick<StepEvent, 'ms' | 'note' | 'areas'>): void;
}
