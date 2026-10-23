import { useState } from 'preact/hooks';
import type { FailureKind } from '../../core/bot/types';
import { strings } from '../i18n';
import { navigate } from '../router';
import { signIn } from '../store/app';

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const t = strings.value.login;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FailureKind>();

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
      <label class="check"><input name="remember" type="checkbox" defaultChecked />{t.remember}</label>
      {error && <p class="error" role="alert">{error === 'CREDENTIALS' ? t.badCredentials : t.failed}</p>}
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
    </main>
  );
}
