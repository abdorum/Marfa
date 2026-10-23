// The sync job: Raad reading everything from the active source.
// Credentials live in the closure only — never in the job, which is saved.
import type { JobRunner } from '../core/bot/types';
import type { SyncResult } from '../core/model';
import type { Credentials, StudentDataSource } from '../adapters/ports';

export function syncRunner(source: StudentDataSource, credentials?: Credentials): JobRunner<Record<string, never>, SyncResult> {
  return {
    type: 'sync',
    maxAttempts: 5,
    timeoutMs: 90_000,
    attempt: (_params, ctx) => source.sync({ ...ctx, credentials }),
  };
}
