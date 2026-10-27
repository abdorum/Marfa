// Sign-in, and the welcome tour before it (Docs/خطة النسخة 1: ج3). While
// Raad signs in, his line tells the student each step. The college is chosen
// from a list; a student whose college is not there asks for it, and the
// owner's page counts the requests (raad/server/wishes.ts).
import { useEffect, useRef, useState } from 'preact/hooks';
import { Building2, Check, ChevronDown, Languages, Lock, Plus, Share2 } from 'lucide-preact';
import type { SignInFailure } from '../../app/portal';
import { INSTITUTION } from '../../institutions';
import { lang, strings } from '../i18n';
import { RaadLine } from '../raad/RaadLine';
import { navigate } from '../router';
import { lastJob, portal, server, setPrefs } from '../state';
import { COURSE_COLORS } from '../colors';
import { Link, RaadAvatar, Sheet, Spinner } from '../ui';

// Remembering the password is offered ready only in the installed app, which
// lives on the student's own phone; in a browser tab the student chooses.
const installedApp = () => matchMedia('(display-mode: standalone)').matches;

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
      <label class="check"><input name="remember" type="checkbox" defaultChecked={installedApp()} />{t.remember}</label>
      {/* Consent is asked, never assumed: unticked. The details are in the two documents it links. */}
      <label class="check consent">
        <input name="consent" type="checkbox" required />
        <span>{t.consent(<Link href="/terms">{t.terms}</Link>, <Link href="/privacy">{t.privacy}</Link>)}</span>
      </label>
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

/** A college not in the list: its name, and the city and system address if the student knows them. */
function WishSheet({ onClose }: { onClose: () => void }) {
  const t = strings.value.institution;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<'sent' | 'busy' | 'failed'>();
  return (
    <Sheet title={t.title} onClose={onClose}>
      <p class="label" style={{ lineHeight: 1.8 }}>{t.hint}</p>
      {said === 'sent' ? <p class="alert-box ok" role="status">{t.sent}</p> : (
        <form class="wish" onSubmit={async e => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setSaid(await portal.wish({ name: String(f.get('name')).trim(), city: String(f.get('city')).trim(), system: String(f.get('system')).trim() }));
          setBusy(false);
        }}>
          <label class="field">{t.name}<input name="name" required minLength={2} maxLength={80} autoComplete="organization" disabled={busy} /></label>
          <label class="field">{t.city} <small>({t.optional})</small><input name="city" maxLength={40} autoComplete="address-level2" disabled={busy} /></label>
          <label class="field">{t.system} <small>({t.optional})</small><input name="system" type="text" inputMode="url" dir="ltr" maxLength={200} placeholder="sis.example.edu" autoComplete="off" disabled={busy} /></label>
          {said && <p class="alert-box" role="alert">{t[said]}</p>}
          <button class="btn primary block" disabled={busy}>{busy && <Spinner />}{t.send}</button>
        </form>
      )}
    </Sheet>
  );
}

/** The college, as a list to choose from: the ones the portal serves, and a way to ask for another. */
function InstitutionPicker({ onAsk }: { onAsk: () => void }) {
  const t = strings.value.institution;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div class="inst-pick" ref={box}>
      <button type="button" class="chip glass" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Building2 />{INSTITUTION.name[lang.value]}<ChevronDown class="caret" />
      </button>
      {open && (
        <ul class="inst-menu" role="listbox" aria-label={t.pick}>
          <li role="option" aria-selected="true">
            <button type="button" onClick={() => setOpen(false)}><Building2 /><span>{INSTITUTION.name[lang.value]}</span><Check class="tick" /></button>
          </li>
          <li role="option" aria-selected="false" class="missing">
            <button type="button" onClick={() => { setOpen(false); onAsk(); }}><Plus /><span>{t.missing}</span></button>
          </li>
        </ul>
      )}
    </div>
  );
}

export function Login() {
  const t = strings.value;
  const [asking, setAsking] = useState(false);
  return (
    <main class="login">
      <div class="row-flex" style={{ justifyContent: 'flex-end' }}><LangSwitch /></div>
      <div class="brand">
        <img class="logo" src="/icons/icon.svg" alt="" width="78" height="78" />
        <h1>{t.appName}</h1>
        <p>{t.tagline}</p>
        <InstitutionPicker onAsk={() => setAsking(true)} />
      </div>
      <section class="card">
        <LoginForm onDone={() => navigate('/', { replace: true })} />
      </section>
      <button class="btn glass demo" onClick={() => void portal.startDemo().then(() => navigate('/', { replace: true }))}>{t.login.demo}</button>
      <p class="legal-note">{t.unofficial}</p>
      {asking && <WishSheet onClose={() => setAsking(false)} />}
    </main>
  );
}

// ---------- Welcome ----------

function ArtCards() {
  return (
    <div class="stack-art" aria-hidden="true">
      <div class="card art a1">
        <div class="art-lines"><i style={{ '--c': COURSE_COLORS[0] }} /><i style={{ '--c': COURSE_COLORS[2] }} /><i style={{ '--c': COURSE_COLORS[4] }} /></div>
      </div>
      <div class="card art a2">
        <span class="card-head"><span class="chip lime"><i class="pulse" />{strings.value.now.now}</span></span>
        <span class="big">25</span>
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
    <div class="card"><Lock size={72} strokeWidth={1.25} /></div>
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
