// Anonymous Raad statistics, sent only when the student opted in (ADR-014).
// No ID, no name, no job parameters.
import type { Job } from '../../../raad/engine/types';

export function sendMetrics(job: Job<unknown, unknown>, durationMs: number, appVersion: string) {
  const body = {
    jobType: job.type,
    outcome: job.state,
    attempts: job.attempt,
    sessionResets: Math.max(0, job.steps.filter(s => s.key === 'signin' && s.status !== 'start').length - 1),
    errorClasses: [...new Set(job.steps.filter(s => s.status === 'fail' && s.note).map(s => s.note!))],
    durationMs,
    appVersion,
  };
  void fetch('/api/v1/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}
