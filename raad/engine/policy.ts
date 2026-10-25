// How Raad reacts to each kind of failure.
import type { FailureKind, JobState } from './types';

/** Never less than this between two attempts, whatever happened. */
export const MIN_GAP_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const RATE_LIMIT_MS = 60000;

export type Decision = { retry: true; delayMs: number } | { retry: false; state: Extract<JobState, 'failed' | 'needs_input' | 'cancelled'> };

/**
 * `retry` is how many retries have happened before this one (1 for the first retry).
 * `random` returns [0, 1); jitter spreads retries from many students apart.
 */
export function decide(kind: FailureKind, retry: number, random: () => number): Decision {
  switch (kind) {
    case 'SESSION':
      return { retry: true, delayMs: MIN_GAP_MS };
    case 'TRANSIENT': {
      const base = Math.min(MAX_BACKOFF_MS, MIN_GAP_MS * 2 ** (retry - 1));
      const jitter = base * 0.25 * (random() * 2 - 1);
      return { retry: true, delayMs: Math.max(MIN_GAP_MS, Math.round(base + jitter)) };
    }
    case 'RATE_LIMIT':
      return { retry: true, delayMs: RATE_LIMIT_MS + Math.round(random() * 10000) };
    case 'CREDENTIALS':
      return { retry: false, state: 'needs_input' };
    case 'CANCELLED':
      return { retry: false, state: 'cancelled' };
    case 'PAUSED':
    case 'UNEXPECTED':
      return { retry: false, state: 'failed' };
  }
}
