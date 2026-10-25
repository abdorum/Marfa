// Sign-in, and the welcome tour before it (Docs/خطة النسخة 1: ج3). While
// Raad signs in, his line tells the student each step.
import { useState } from 'preact/hooks';
import { Building2, Languages, Lock, Share2 } from 'lucide-preact';
import type { SignInFailure } from '../../app/portal';
import { INSTITUTION } from '../../institutions';
import { lang, strings } from '../i18n';
import { RaadLine } from '../raad/RaadLine';
import { navigate } from '../router';
import { lastJob, portal, server, setPrefs } from '../state';
import { Link, RaadAvatar, Spinner } from '../ui';

// Remembering the password suits a personal phone, not a shared computer.
const personalDevice = () => matchMedia('(display-mode: standalone), (pointer: coarse)').matches;

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const t = strings.value.login;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInFailure>();
  const paused = server.value?.message?.[lang.value] ?? server.value?.message?.ar;

  return (
    <form onSubmit={async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true);
      setError(undefined);
      const failure = await portal.signIn({ userid: String(f.get('userid')).trim(), pwd: String(f.get('pwd')) }, f.get('remember') === 'on');
      setBusy(false);
      if (failure) setError(failure);
      else onDone?.();
    }}>
      <label class="field">{t.userid}<input name="userid" inputMode="numeric" autoComplete="username" required disabled={busy} /></label>
      <label class="field">{t.password}<input name="pwd" type="password" autoComplete="current-password" required disabled={busy} /></label>
      <label class="check"><input name="remember" type="checkbox" defaultChecked={personalDevice()} />{t.remember}</label>
      {busy && <RaadLine onCard />}
      {error && (
        <div class="alert-box" role="alert">
          <p>{t.errors[error] ?? t.errors.other}{error === 'PAUSED' && paused ? ` ${paused}` : ''}</p>
          {/* What Raad saw, so a report from a student says exactly where it broke. */}
          <small>{[error, ...(lastJob.value?.steps ?? []).filter(s => s.status === 'fail').map(s => `${s.key}${s.note ? `:${s.note}` : ''}`)].join(' · ')}</small>
        </div>
      )}
      <button class="btn primary block" disabled={busy}>{busy && <Spinner />}{t.submit}</button>
    </form>
  );
}

function LangSwitch() {
  return (
    <button class="chip glass" onClick={() => void setPrefs({ lang: lang.value === 'ar' ? 'en' : 'ar' })}>
      <Languages />{lang.value === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}

export function Login() {
  const t = strings.value;
  const institution = INSTITUTION.name[lang.value];
  return (
    <main class="login">
      <div class="row-flex" style={{ justifyContent: 'flex-end' }}><LangSwitch /></div>
      <div class="brand">
        <img class="logo" src="/icons/icon.svg" alt="" width="78" height="78" />
        <h1>{t.appName}</h1>
        <p>{t.tagline}</p>
        <span class="chip glass"><Building2 />{institution}</span>
      </div>
      <section class="card">
        <LoginForm onDone={() => navigate('/', { replace: true })} />
      </section>
      <button class="btn glass demo" onClick={() => void portal.startDemo().then(() => navigate('/', { replace: true }))}>{t.login.demo}</button>
      <p class="legal-note">
        {t.login.consent(<Link href="/terms">{t.login.terms}</Link>, <Link href="/privacy">{t.login.privacy}</Link>)}
        <br />{t.unofficial(institution)}
      </p>
    </main>
  );
}

// ---------- Welcome ----------

function ArtCards() {
  return (
    <div class="stack-art" aria-hidden="true">
      <div class="card art a1">
        <div class="art-lines"><i style={{ '--c': '#3D63FF' }} /><i style={{ '--c': '#E0508F' }} /><i style={{ '--c': '#0FA3B1' }} /></div>
      </div>
      <div class="card night hud art a2">
        <span class="chip lime"><i class="pulse" />{strings.value.now.now}</span>
        <span class="big" style={{ color: 'var(--highlight)' }}>25</span>
      </div>
      <div class="card art a3"><span class="art-ring"><b>21%</b></span></div>
    </div>
  );
}

const ArtRaad = () => (
  <div class="art-raad" aria-hidden="true">
    <span class="orbit o1" /><span class="orbit o2" />
    <RaadAvatar size={150} status="working" />
  </div>
);

const ArtPrivacy = () => (
  <div class="art-lock" aria-hidden="true">
    <div class="card night hud"><Lock size={72} strokeWidth={1.5} /></div>
    <span class="chip lime"><Share2 />{strings.value.share.share}</span>
  </div>
);

export function Welcome() {
  const t = strings.value.welcome;
  const [i, setI] = useState(0);
  const last = i === t.slides.length - 1;
  const done = () => void setPrefs({ welcomed: true });
  const slide = t.slides[i]!;
  return (
    <main class="welcome">
      <div class="row-flex" style={{ justifyContent: 'space-between' }}>
        <LangSwitch />
        {!last && <button class="chip glass" onClick={done}>{t.skip}</button>}
      </div>
      <div class="welcome-art">{i === 0 ? <ArtCards /> : i === 1 ? <ArtRaad /> : <ArtPrivacy />}</div>
      <div class="welcome-text" key={i}>
        <h1>{slide.title}</h1>
        <p>{slide.body}</p>
        <div class="welcome-nav">
          <div class="dots" aria-hidden="true">{t.slides.map((_, k) => <i class={k === i ? 'on' : ''} />)}</div>
          <button class="btn primary" onClick={() => (last ? done() : setI(i + 1))}>{last ? t.start : t.next}</button>
        </div>
      </div>
    </main>
  );
}
