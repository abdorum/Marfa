// Raad's line: tells the student, as it happens, what Raad is doing (the
// transparency the owner asked for), and why he stopped when he fails.
import { useEffect, useState } from 'preact/hooks';
import type { StepEvent } from '../../../raad/engine/types';
import { lang, strings } from '../i18n';
import { activeJob, lastJob, liveStep, server } from '../state';
import { Link, RaadAvatar, Spinner } from '../ui';

/** Re-render every `ms` while mounted (countdowns). */
export function useTick(ms: number, on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set(n => n + 1), ms);
    return () => clearInterval(id);
  }, [ms, on]);
}

export function stepText(s: StepEvent): string {
  const t = strings.value.raad.steps;
  switch (s.key) {
    case 'fetch': return t.fetch((s.areas ?? []).map(a => strings.value.areas[a] ?? a));
    case 'wait': return t.wait(Math.max(1, Math.ceil((Date.parse(s.at) + (s.ms ?? 0) - Date.now()) / 1000)));
    case 'attempt': return t.attempt(Number(s.note) || 2);
    default: return t[s.key];
  }
}

/** A finished step's name for Raad's log: "القراءة: الدرجات". */
export function stepLabel(s: StepEvent): string {
  const names = strings.value.raad.stepNames;
  if (s.key === 'fetch' && s.areas?.length) return `${names.fetch}: ${s.areas.map(a => strings.value.areas[a] ?? a).join('، ')}`;
  return names[s.key] ?? s.key;
}

/** The reason a job failed, in the student's words. */
export function failureText(kind: string, message?: string): string {
  const f = strings.value.raad.failure;
  if (message === 'BLOCKED') return f.BLOCKED!;
  return f[kind] ?? f.UNEXPECTED!;
}

export function RaadLine({ onCard, showIdle }: { onCard?: boolean; showIdle?: boolean }) {
  const step = liveStep.value;
  const job = activeJob.value;
  const last = lastJob.value;
  const paused = server.value?.paused;
  useTick(1000, step?.key === 'wait');
  const cls = `raadline${onCard ? ' on-card' : ''}`;

  if (paused) {
    const msg = server.value?.message?.[lang.value] ?? server.value?.message?.ar ?? server.value?.message?.en;
    return (
      <Link href="/raad" class={`${cls} fail`} aria-live="polite">
        <RaadAvatar size={28} status="paused" />
        <span class="text">{strings.value.raad.failure.PAUSED}{msg ? ` ${msg}` : ''}</span>
      </Link>
    );
  }
  if (job && step) {
    return (
      <div class={cls} role="status" aria-live="polite">
        <RaadAvatar size={28} status={job.state === 'waiting_retry' ? 'retrying' : 'working'} />
        <span class="text" key={`${step.key}${step.note ?? ''}${step.status}`}>{stepText(step)}</span>
        <Spinner />
      </div>
    );
  }
  if (last && last.state !== 'succeeded' && last.failure && last.failure.message !== 'INTERRUPTED') {
    return (
      <Link href="/raad" class={`${cls} fail`}>
        <RaadAvatar size={28} status="needs" />
        <span class="text">{failureText(last.failure.kind, last.failure.message)}</span>
      </Link>
    );
  }
  if (showIdle && last?.state === 'succeeded') {
    return (
      <div class={cls}>
        <RaadAvatar size={28} status="idle" />
        <span class="text">{strings.value.raad.steps.done}</span>
      </div>
    );
  }
  return null;
}
