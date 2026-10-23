// Phase 1 shell: proves the core end to end (Raad → source → canonical
// model → derive). Phase 2 replaces it with the real interface.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { createDemoSource } from '../adapters/demo/source';
import { createPeopleSoftSource } from '../adapters/peoplesoft/client';
import type { Credentials, StudentDataSource } from '../adapters/ports';
import { syncRunner } from '../app/sync';
import { createJob, realDeps, runJob } from '../core/bot/engine';
import type { Job } from '../core/bot/types';
import { academicWeek, alerts, courseList, currentTerm, meetingsOn, withStates } from '../core/derive';
import type { Snapshot, SyncResult } from '../core/model';
import { mergeSnapshot } from '../core/snapshot';
import './shell.css';

const DEMO = new URLSearchParams(location.search).has('demo');
const CAPTURE = import.meta.env.DEV && new URLSearchParams(location.search).has('capture');
const prefs = { absenceLimit: 25 };

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

function makeSource(onCapture: (msg: string) => void): StudentDataSource {
  if (DEMO) return createDemoSource();
  return createPeopleSoftSource({
    onRaw: CAPTURE ? (pages, x, cred) => {
      const person = {
        userid: cred.userid, nameAr: x.grades?.nameAr, nameEn: x.attendance?.nameEn,
        email: x.center?.email, phone: x.center?.phone, firstName: x.center?.firstName,
      };
      fetch('/dev/capture', { method: 'POST', body: JSON.stringify({ pages, person }) })
        .then(r => r.json()).then(r => onCapture(JSON.stringify(r)), e => onCapture(String(e)));
    } : undefined,
  });
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [job, setJob] = useState<Job<Record<string, never>, SyncResult>>();
  const [capture, setCapture] = useState('');

  async function sync(credentials?: Credentials) {
    const source = makeSource(setCapture);
    const runner = syncRunner(source, credentials);
    const deps = { ...realDeps, save: (j: Job<any, any>) => setJob({ ...j, steps: [...j.steps] }) };
    const done = await runJob(createJob(runner, {}, deps), runner, deps);
    setJob({ ...done });
    if (done.state === 'succeeded' && done.result) setSnapshot(s => mergeSnapshot(s, done.result!, source.id));
  }

  const busy = job && !['succeeded', 'failed', 'needs_input', 'cancelled'].includes(job.state);

  return (
    <main>
      <header><h1>قاعدة الطالب</h1><span class="tag">TIES · Phase 1{DEMO ? ' · demo' : ''}{CAPTURE ? ' · capture' : ''}</span></header>

      {!snapshot && (DEMO
        ? <button class="primary" disabled={busy} onClick={() => sync()}>⚡ تشغيل رعد</button>
        : <form onSubmit={e => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void sync({ userid: String(f.get('userid')).trim(), pwd: String(f.get('pwd')) });
          }}>
            <input name="userid" inputMode="numeric" autoComplete="username" placeholder="ID" dir="ltr" required />
            <input name="pwd" type="password" autoComplete="current-password" placeholder="••••••" dir="ltr" required />
            <button class="primary" disabled={busy}>⚡</button>
          </form>)}

      {job && <section class="card">
        <h2>رعد · {job.state} · {job.attempt}/{job.maxAttempts}</h2>
        <ol class="steps">{job.steps.map(s => <li class={s.status}>{s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : '·'} {s.label} {s.ms != null && <small>{s.ms}ms</small>} {s.note && <small>{s.note}</small>}</li>)}</ol>
        {job.failure && <p class="risk">{job.failure.kind}: {job.failure.message}</p>}
        {capture && <p><code>{capture}</code></p>}
      </section>}

      {snapshot && <Summary s={snapshot} />}
    </main>
  );
}

function Summary({ s }: { s: Snapshot }) {
  const now = new Date();
  const term = currentTerm(s);
  return (
    <>
      <section class="card">
        <h2>{s.student?.name.ar ?? s.student?.name.en} <bdi>{s.student?.id}</bdi></h2>
        <p>{term?.name} · <bdi>{term?.code}</bdi> · week {academicWeek(term, now) ?? '—'}</p>
        <p class="muted">{Object.entries(s.provenance).map(([k, p]) => `${k}:${p?.status}`).join(' · ')}</p>
      </section>
      <section class="card">
        <h2>اليوم</h2>
        {withStates(meetingsOn(s, now), now).map(m => <p class={`row ${m.state}`}><bdi>{hhmm(m.start)}–{hhmm(m.end)}</bdi> · {m.title ?? m.courseKey} · {m.component}</p>)}
      </section>
      <section class="card">
        <h2>تنبيهات</h2>
        {alerts(s, prefs, now).map(a => <p class="row">{a.kind} {a.kind === 'attendance' ? `${a.record.courseKey} ${a.record.absencePct}%` : a.kind === 'exam' ? `${a.exam.courseKey} +${a.inDays}d` : a.notice.title}</p>)}
      </section>
      <section class="card">
        <h2>المواد</h2>
        {courseList(s, prefs).map(r => <p class={`row ${r.level}`}><bdi>{r.course.key}</bdi> · {r.course.title} · {r.attendance?.absencePct ?? '—'}% · {r.grade?.grade ?? '—'}</p>)}
      </section>
    </>
  );
}

render(<App />, document.getElementById('app')!);
