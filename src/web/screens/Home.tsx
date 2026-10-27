// The home board: a greeting, Raad's line when he is at work, and the cards.
import { LogOut, RefreshCw } from 'lucide-preact';
import { academicWeek, currentTerm } from '../../core/derive';
import { HOME_CARDS } from '../cards/home';
import { ago, dateLabel, lang, strings } from '../i18n';
import { RaadLine } from '../raad/RaadLine';
import { navigate } from '../router';
import { activeJob, hasCredentials, lastUpdated, mode, portal, prefs, raadStatus, snapshot } from '../state';
import { Avatar, Link, toast } from '../ui';

const DAY_MS = 24 * 60 * 60 * 1000;

export function Home() {
  const s = snapshot.value!;
  const t = strings.value;
  const now = new Date();
  const week = academicWeek(currentTerm(s), now);
  const first = s.student?.firstName;
  const name = lang.value === 'ar' ? first?.ar ?? first?.en : first?.en ?? first?.ar;
  const updated = lastUpdated.value;
  const old = !updated || now.getTime() - Date.parse(updated) > DAY_MS;
  const hidden = new Set(prefs.value.hiddenCards);
  const cards = HOME_CARDS.filter(c => !(c.optional && hidden.has(c.id)) && (c.show?.() ?? true));
  const busy = !!activeJob.value;

  const refresh = () => {
    const wait = portal.manualWait();
    if (mode.value === 'live' && !hasCredentials.value) navigate('/raad');
    else if (wait) toast(t.raad.refreshAfter(Math.ceil(wait / 60_000)));
    else if (raadStatus.value !== 'paused') void portal.sync();
  };

  return (
    <>
      <header class="hello wide">
        <div class="hello-top">
          <div class="title">
            <h1>{t.home.greeting(now.getHours(), name)}</h1>
            <p class="date">
              <span>{dateLabel(now)}</span>
              {week && <><span class="sep">/</span><span class="mono">{t.home.week(week)}</span></>}
            </p>
          </div>
          <Link href="/space" aria-label={t.tabs.space}><Avatar /></Link>
        </div>
        <div class="dots-rule" aria-hidden="true" />
        <div class="hello-chips">
          <button class={`chip ${old ? 'lime' : 'glass'}`} onClick={refresh} disabled={busy} aria-label={t.refresh}>
            <RefreshCw class={busy ? 'spin-icon' : ''} />
            {updated ? (old ? t.home.stale : t.home.updated(ago(updated))) : t.home.neverUpdated}
          </button>
        </div>
        {mode.value === 'demo' && (
          <div class="banner">
            <span>{t.home.demo}</span>
            <span class="spacer" />
            <button class="btn sm dark" onClick={() => void portal.exitDemo().then(() => navigate('/', { replace: true }))}><LogOut />{t.home.exitDemo}</button>
          </div>
        )}
        <RaadLine />
      </header>
      <main class="page wide">
        <div class="board">
          {cards.map((c, i) => <c.card key={c.id} index={i + 1} />)}
        </div>
      </main>
    </>
  );
}
