import { useState } from 'preact/hooks';
import { Check, Plus, RefreshCw, X, Zap } from 'lucide-preact';
import type { Job } from '../../core/bot/types';
import { minutesAgo, strings } from '../i18n';
import { navigate } from '../router';
import { activeJob, hasCredentials, jobs, online, raadStatus, runSync } from '../store/app';
import { Empty, Notice, Row, TopBar } from '../ui';
import { LoginForm } from './Login';

function RaadStatus() {
  const t = strings.value.raadScreen;
  const status = raadStatus.value;
  const job = activeJob.value;
  const [cls, label] =
    status === 'working' ? ['', t.working]
    : status === 'retrying' ? ['retry', t.retrying(job?.attempt ?? 0, job?.maxAttempts ?? 0)]
    : status === 'needs' ? ['needs', t.needsYou]
    : status === 'offline' ? ['off', t.offline]
    : ['', t.ready];
  return <span class={`status ${cls}`}><i />{label}</span>;
}

const jobTitle = (j: Job<any, any>) => (j.type === 'sync' ? strings.value.raadScreen.sync : j.type);

export function Raad() {
  const t = strings.value;
  const [sheet, setSheet] = useState(false);
  const list = jobs.value;

  return (
    <>
      <TopBar title={t.raadScreen.title} end={<RaadStatus />} />
      <div class="page">
        {!hasCredentials.value && (
          <div class="card stack">
            <Notice tone="risk">{t.raadScreen.needsYou}</Notice>
            <LoginForm />
          </div>
        )}
        <div class="stack">
          {list.map(j => (
            <Row href={`/raad/${j.id}`} state={j.state === 'running' || j.state === 'waiting_retry' ? 'now' : undefined}
              title={jobTitle(j)}
              meta={`${t.jobState[j.state]} · ${t.ago(minutesAgo(j.updatedAt) ?? 0)}`}
              end={j.state === 'succeeded' ? <Check /> : j.state === 'failed' || j.state === 'needs_input' ? <X class="risk" /> : <Zap />} />
          ))}
          {!list.length && <Empty>{t.raadScreen.empty}</Empty>}
        </div>

        {sheet && (
          <section class="sheet" role="dialog" aria-label={t.raadScreen.newTask}>
            <span class="grab" />
            <h2 class="section-title">{t.raadScreen.newTask}</h2>
            <button class="row outlined" disabled={!hasCredentials.value || !!activeJob.value || !online.value}
              onClick={() => { setSheet(false); void runSync(); }}>
              <i class="dot" /><span class="t">{t.raadScreen.sync}</span><span class="end"><RefreshCw /></span>
            </button>
            <button class="row outlined" disabled aria-disabled="true">
              <i class="dot" /><span class="t">{t.raadScreen.enroll}</span><span class="m">{t.raadScreen.soon}</span>
            </button>
          </section>
        )}
      </div>
      <button class="fab" aria-label={t.raadScreen.newTask} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>{sheet ? <X /> : <Plus />}</button>
    </>
  );
}

export function RaadJob({ id }: { id: string }) {
  const t = strings.value;
  const j = jobs.value.find(x => x.id === id);
  if (!j) { navigate('/raad', { replace: true }); return null; }
  return (
    <>
      <TopBar backTo="/raad" crumb={t.raadScreen.title} title={jobTitle(j)} end={<span class="pill">{t.jobState[j.state]}</span>} />
      <div class="page">
        {j.failure && j.state !== 'succeeded' && <Notice tone="risk">{t.failure[j.failure.kind]}</Notice>}
        <ol class="timeline">
          {j.steps.map(s => (
            <li class={s.status}>
              <span>{s.status === 'ok' ? <Check /> : s.status === 'fail' ? <X /> : '·'}</span>
              <span>{s.label}</span>
              <small>{[s.ms != null ? `${(s.ms / 1000).toFixed(1)}s` : '', s.note ?? ''].filter(Boolean).join(' · ')}</small>
            </li>
          ))}
        </ol>
        <p class="label"><bdi>{j.attempt}/{j.maxAttempts}</bdi> · {t.ago(minutesAgo(j.updatedAt) ?? 0)}</p>
      </div>
    </>
  );
}
