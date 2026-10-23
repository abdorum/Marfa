import { useState } from 'preact/hooks';
import { strings } from '../i18n';
import { Link } from '../ui';
import { navigate } from '../router';
import { lastJob, signIn, type SignInFailure } from '../store/app';

// Remembering the password suits a personal phone, not a shared computer.
const personalDevice = () => matchMedia('(display-mode: standalone), (pointer: coarse)').matches;

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const t = strings.value.login;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInFailure>();

  return (
    <form onSubmit={async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true);
      setError(undefined);
      const failure = await signIn({ userid: String(f.get('userid')).trim(), pwd: String(f.get('pwd')) }, f.get('remember') === 'on');
      setBusy(false);
      if (failure) setError(failure);
      else onDone?.();
    }}>
      <label class="field">{t.userid}<input name="userid" inputMode="numeric" autoComplete="username" required /></label>
      <label class="field">{t.password}<input name="pwd" type="password" autoComplete="current-password" required /></label>
      <label class="check"><input name="remember" type="checkbox" defaultChecked={personalDevice()} />{t.remember}</label>
      {error && (
        <div class="error" role="alert">
          <p>{error === 'LOCKED' ? t.locked : error === 'CREDENTIALS' ? t.badCredentials : t.failed}</p>
          {/* What Raad saw, so a report from a student says exactly where it broke. */}
          <p dir="ltr" style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
            {[error, ...(lastJob.value?.steps ?? []).filter(s => s.status === 'fail').map(s => `${s.label}${s.note ? `: ${s.note}` : ''}`)].join(' · ')}
          </p>
        </div>
      )}
      <button class="primary" disabled={busy}>{busy ? <span class="spin" aria-hidden="true" /> : null}{t.submit}</button>
    </form>
  );
}

export function Login() {
  return (
    <main class="login">
      <div class="brand">
        <img src="/icons/icon.svg" alt="" />
        <h1>{strings.value.appName}</h1>
      </div>
      <LoginForm onDone={() => navigate('/', { replace: true })} />
      <p class="legal-note">
        {strings.value.login.consent(<Link href="/terms">{strings.value.login.terms}</Link>, <Link href="/privacy">{strings.value.login.privacy}</Link>)}
        <br />{strings.value.about.unofficial}
      </p>
    </main>
  );
}
