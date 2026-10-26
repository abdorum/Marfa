// The sync job: Raad reads from the source what is due, then the result is
// merged with what the device already has, compared with it, and sealed back.
// Credentials live in the closure only — never in the job, which is saved.
import type { JobRunner } from '../../raad/engine/types';
import type { DataArea, Snapshot } from '../core/model';
import { mergeSnapshot } from '../core/snapshot';
import type { Credentials, StudentDataSource } from '../ports/source';

/** What a finished sync reports; the data itself never sits in the job log. */
export interface SyncSummary {
  changes: number;
  fresh: number;
  failed: number;
}

export interface SyncRunnerDeps {
  source: StudentDataSource;
  credentials?: Credentials;
  /** The areas to read; undefined reads everything. */
  areas?: readonly DataArea[];
  current(): Snapshot | undefined;
  save(next: Snapshot): Promise<void>;
}

export function syncRunner(d: SyncRunnerDeps): JobRunner<Record<string, never>, SyncSummary> {
  return {
    type: 'sync',
    // Each attempt may sign in to the college: three at most, so a struggling
    // college is not asked again and again.
    maxAttempts: 3,
    timeoutMs: 120_000,
    async attempt(_params, ctx) {
      const result = await d.source.sync({ ...ctx, credentials: d.credentials, areas: d.areas });
      const before = d.current();
      let t0 = Date.now();
      ctx.step('merge', 'start');
      const next = mergeSnapshot(before, result, d.source.manifest.id);
      const changes = next.changes.filter(c => c.at === result.fetchedAt).length;
      ctx.step('merge', 'ok', { ms: Date.now() - t0 });
      t0 = Date.now();
      ctx.step('save', 'start');
      await d.save(next);
      ctx.step('save', 'ok', { ms: Date.now() - t0 });
      const statuses = Object.values(result.provenance).map(p => p?.status);
      return { changes, fresh: statuses.filter(s => s === 'fresh').length, failed: statuses.filter(s => s !== 'fresh').length };
    },
  };
}
