// Raad's page, reached from «المزيد»: what he is doing now, a refresh, and his
// log. Who he is and how he works are told once, in About (RaadAbout).
import { Check, MapPin, RefreshCw, X } from 'lucide-preact';
import type { Job } from '../../../raad/engine/types';
import { INSTITUTION } from '../../institutions';
import { Card } from '../cards/Card';
import { ago, lang, strings } from '../i18n';
import { failureText, RaadLine, stepLabel, useTick } from '../raad/RaadLine';
import { activeJob, hasCredentials, jobs, lastUpdated, mode, online, portal, raadStatus, server } from '../state';
import { Empty, Link, RaadAvatar, TopBar } from '../ui';
import { LoginForm } from './Login';

function JobRow({ j }: { j: Job<any, any> }) {
  const t = strings.value.raad;
  const done = j.state === 'succeeded';
  const failed = j.state === 'failed' || j.state === 'needs_input';
  const steps = j.steps.filter(s => s.status !== 'start' && s.key !== 'attempt');
  return (
    <details class="job">
      <summary class="lrow" style={{ '--c': done ? 'var(--ok)' : failed ? 'var(--risk)' : 'var(--accent)' }}>
        <i class="bar" />
        <span class="t">{t.sync}</span>
        <span class="m">{t.jobState[j.state]} · {ago(j.updatedAt)}{j.attempt > 1 ? ` · ${t.attempts(j.attempt, j.maxAttempts)}` : ''}</span>
        <span class="e">{done ? <Check size={18} class="ok" /> : failed ? <X size={18} class="risk" /> : null}</span>
      </summary>
      <ol class="steps">
        {steps.map(s => (
          <li class={s.status}>
            {s.status === 'fail' ? <X /> : <Check />}
            <span>{stepLabel(s)}</span>
            <small>{[s.ms != null ? `${(s.ms / 1000).toFixed(1)}s` : '', s.status === 'fail' ? s.note ?? '' : ''].filter(Boolean).join(' · ')}</small>
          </li>
        ))}
        {j.failure && !done && <li class="fail"><X /><span>{failureText(j.failure.kind, j.failure.message)}</span><small /></li>}
      </ol>
    </details>
  );
}

export function Raad() {
  const t = strings.value.raad;
  const status = raadStatus.value;
  useTick(60_000);
  const wait = portal.manualWait();
  const canRun = hasCredentials.value && online.value && !activeJob.value && status !== 'paused' && !wait;
  const message = server.value?.message?.[lang.value] ?? server.value?.message?.ar;
  const list = jobs.value.filter(j => j.type === 'sync');

  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{strings.value.tabs.me}</Link>} title={t.name} />
      <main class="page">
        <Card id="raad" title={t.card} index={1} tone="night" hud>
          <div class="raad-id">
            <RaadAvatar size={92} />
            <div>
              <h2>{t.name}</h2>
              <div class="chips role">
                <span class="chip lime">{t.role}</span>
                <span class="chip">{t.status[status]}</span>
              </div>
            </div>
          </div>
          <div class="raad-meta">
            <div><small>{t.updatedLabel}</small><b>{lastUpdated.value ? ago(lastUpdated.value) : '—'}</b></div>
          </div>
          {status === 'paused' && message && <p class="alert-box"><bdi>{message}</bdi></p>}
          <div data-noshare>
            <RaadLine onCard showIdle />
          </div>
          <button class="btn primary block" data-noshare disabled={!canRun} onClick={() => void portal.sync()}><RefreshCw />{wait ? t.refreshAfter(Math.ceil(wait / 60_000)) : t.refresh}</button>
        </Card>

        {mode.value === 'live' && !hasCredentials.value && (
          <Card id="raad-signin" title={t.needsYou} index={2} share={false}>
            <LoginForm />
          </Card>
        )}

        <Card id="raad-log" title={t.log} index={3} share={false}>
          {list.length ? <div class="list">{list.slice(0, 12).map(j => <JobRow key={j.id} j={j} />)}</div> : <Empty>{t.logEmpty}</Empty>}
        </Card>
      </main>
    </>
  );
}

/** Who Raad is, what he does and never does, and how: in About, for whoever looks for it. */
export function RaadAbout({ from }: { from: number }) {
  const t = strings.value.raad;
  const home = INSTITUTION.raadHome?.[lang.value];
  return (
    <>
      <Card id="raad-who" title={strings.value.about.raad} index={from} tone="night" hud>
        <div class="raad-id">
          <RaadAvatar size={64} status="idle" />
          <div>
            <h2>{t.name}</h2>
            <div class="chips role"><span class="chip lime">{t.role}</span></div>
          </div>
        </div>
        <p class="raad-intro">{t.intro}</p>
        {home && <div class="raad-meta"><div><small><MapPin size={11} /> {t.home}</small><b>{home}</b></div></div>}
      </Card>

      <Card id="raad-does" title={t.does} index={from + 1}>
        <ul class="creed">{t.doesList.map(x => <li><span><Check /></span><span>{x}</span></li>)}</ul>
      </Card>

      <Card id="raad-never" title={t.never} index={from + 2}>
        <ul class="creed never">{t.neverList.map(x => <li><span><X /></span><span>{x}</span></li>)}</ul>
      </Card>

      <Card id="raad-how" title={t.how} index={from + 3}>
        <ol class="flow">
          {t.path.map((p, i) => (
            <li class={i === 1 || i === 3 ? 'raad' : ''}>
              <span class="n">{String(i + 1).padStart(2, '0')}</span>
              <span><b>{p}</b><small>{t.pathNotes[i]}</small></span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
