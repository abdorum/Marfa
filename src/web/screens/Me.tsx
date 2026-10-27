// "Me": the student card, holds and to-dos, everything else, settings, about.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ChevronLeft, ExternalLink, Info, ListTodo, LogOut, MessageCircle, Settings as Gear, Shuffle, Table2 } from 'lucide-preact';
import { PRODUCT } from '../../app/product';
import { avatarFor } from '../../core/derive';
import type { ExtraBlock } from '../../core/model';
import { INSTITUTION } from '../../institutions';
import { Card } from '../cards/Card';
import { HOME_CARDS } from '../cards/home';
import { CHANGELOG } from '../changelog';
import { lang, strings, type Lang } from '../i18n';
import { LEGAL, UPDATED } from '../i18n/legal';
import { navigate } from '../router';
import { portal, prefs, setPrefs, signedIn, snapshot } from '../state';
import { Avatar, Empty, Link, toast, TopBar } from '../ui';
import { RaadAbout } from './Raad';

const AVATARS_URL = '/avatars.json';

/** Links come from the institution's pages: only real web links, never javascript: or data:. */
const safeHref = (href?: string) => {
  try {
    const u = new URL(href ?? '');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};

function useAvatars() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => { fetch(AVATARS_URL).then(r => r.json()).then(setList).catch(() => {}); }, []);
  return list;
}

/** A row in a menu card. */
function MenuRow({ href, onClick, icon, title, danger }: { href?: string; onClick?: () => void; icon: ComponentChildren; title: string; danger?: boolean }) {
  const inner = <><span class="change-ico">{icon}</span><span class={`t${danger ? ' risk' : ''}`}>{title}</span><span class="e"><ChevronLeft class="flip-ltr" size={18} /></span></>;
  return href ? <Link href={href} class="lrow">{inner}</Link> : <button class="lrow" onClick={onClick}>{inner}</button>;
}

export function Me() {
  const s = snapshot.value!;
  const t = strings.value;
  const st = s.student;
  const avatars = useAvatars();
  const name = (lang.value === 'ar' ? st?.name.ar ?? st?.name.en : st?.name.en ?? st?.name.ar) ?? '—';
  const other = lang.value === 'ar' ? st?.name.en : st?.name.ar;
  const nextAvatar = () => {
    if (!avatars.length) return;
    const current = prefs.value.avatar ?? avatarFor(st?.id ?? '', avatars);
    void setPrefs({ avatar: avatars[(avatars.indexOf(current ?? '') + 1) % avatars.length] });
  };
  const feedback = async () => {
    const standalone = matchMedia('(display-mode: standalone)').matches;
    const note = `${PRODUCT.name.en} ${PRODUCT.version} · ${navigator.userAgent.match(/iPhone|iPad|Android|Windows|Mac OS X|Linux/)?.[0] ?? 'device'}${standalone ? ' · installed' : ''}`;
    try { await navigator.clipboard.writeText(note); toast(t.me.feedbackCopied); } catch { /* no clipboard: the channel still opens */ }
    window.open(PRODUCT.contact, '_blank', 'noopener');
  };

  return (
    <>
      <TopBar title={t.me.title} />
      <main class="page">
        <Card id="student-card" title={t.me.card} index={1} tone="night" hud>
          <div class="idcard">
            <div class="idcard-top">
              <button onClick={nextAvatar} aria-label={t.me.avatar} style={{ border: 0, background: 'none', padding: 0, position: 'relative' }}>
                <Avatar large />
                {avatars.length > 1 && <span class="chip lime" style={{ position: 'absolute', insetInlineEnd: '-8px', insetBlockEnd: '-6px', padding: '3px' }} data-noshare><Shuffle size={12} /></span>}
              </button>
              <div class="who">
                <h2>{name}</h2>
                {other && <p><bdi>{other}</bdi></p>}
                <p>{[st?.program, INSTITUTION.name[lang.value]].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <dl class="kv">
              <dt>{t.me.id}</dt><dd><bdi data-private>{st?.id ?? '—'}</bdi></dd>
              {st?.email && <><dt>{t.me.email}</dt><dd><bdi data-private>{st.email}</bdi></dd></>}
              {st?.phone && <><dt>{t.me.phone}</dt><dd><bdi data-private>{st.phone}</bdi></dd></>}
              <dt>{t.me.advisor}</dt><dd class="text"><bdi data-private>{st?.advisor ?? '—'}</bdi></dd>
            </dl>
            <div class="strip" aria-hidden="true">{Array.from({ length: 16 }, () => <i />)}</div>
          </div>
        </Card>

        <Card id="me-menu" title={t.tabs.me} index={2} share={false}>
          <div class="list">
            <MenuRow href="/me/notices" icon={<ListTodo />} title={`${t.me.notices}${s.holds.length + s.todos.length ? ` (${s.holds.length + s.todos.length})` : ''}`} />
            <MenuRow href="/me/more" icon={<Table2 />} title={t.me.more} />
            <MenuRow href="/me/settings" icon={<Gear />} title={t.me.settings} />
            <MenuRow href="/me/about" icon={<Info />} title={t.me.about} />
            <MenuRow onClick={() => void feedback()} icon={<MessageCircle />} title={t.me.feedback} />
            <MenuRow danger onClick={async () => { if (confirm(t.me.signOutConfirm)) { await portal.signOut(); navigate('/', { replace: true }); } }} icon={<LogOut />} title={t.me.signOut} />
          </div>
        </Card>
      </main>
    </>
  );
}

export function Notices() {
  const s = snapshot.value!;
  const t = strings.value;
  const all = [...s.holds, ...s.todos];
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.notices.title} />
      <main class="page">
        <Card id="notices" title={t.notices.title} index={1}>
          {all.length ? (
            <div class="list">
              {all.map(n => (
                <div class="lrow" style={{ '--c': n.kind === 'hold' ? 'var(--risk)' : 'var(--accent)' }}>
                  <i class="bar" />
                  <span class="t"><bdi>{n.title}</bdi></span>
                  <span class="m">{n.kind === 'hold' ? t.alerts.hold : t.alerts.todo}{n.detail ? <> · <bdi>{n.detail}</bdi></> : null}</span>
                </div>
              ))}
            </div>
          ) : <Empty>{t.notices.none}</Empty>}
        </Card>
      </main>
    </>
  );
}

const blockTitle = (b: ExtraBlock) => b.titles?.[lang.value] ?? b.titles?.ar ?? b.titles?.en ?? b.title;

export function More() {
  const s = snapshot.value!;
  const t = strings.value;
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.more.title} />
      <main class="page">
        <Card id="more" title={t.more.title} index={1} share={false}>
          <p class="label">{t.more.hint}</p>
          {s.extras.length ? (
            <div class="list">
              {s.extras.map(b => (
                <Link href={`/me/more/${encodeURIComponent(b.id)}`} class="lrow">
                  <span class="change-ico"><Table2 /></span>
                  <span class="t"><bdi>{blockTitle(b)}</bdi></span>
                  <span class="e label"><bdi>{b.rows?.length ?? b.fields?.length ?? ''}</bdi></span>
                </Link>
              ))}
            </div>
          ) : <Empty>{t.more.none}</Empty>}
        </Card>
      </main>
    </>
  );
}

export function MoreBlock({ id }: { id: string }) {
  const s = snapshot.value!;
  const t = strings.value;
  const b = s.extras.find(x => x.id === id);
  if (!b) { navigate('/me/more', { replace: true }); return null; }
  return (
    <>
      <TopBar backTo="/me/more" crumb={<Link href="/me/more">{t.more.title}</Link>} title={<bdi>{blockTitle(b)}</bdi>} />
      <main class="page">
        <Card id={`more-${b.id}`} title={<bdi>{blockTitle(b)}</bdi>} index={1}>
          {b.kind === 'table' && b.columns && (
            <table class="table">
              <thead><tr>{b.columns.map(c => <th>{c}</th>)}</tr></thead>
              <tbody>{(b.rows ?? []).map(r => <tr>{r.map((cell, i) => <td data-h={b.columns![i] ?? ''}><bdi>{cell}</bdi></td>)}</tr>)}</tbody>
            </table>
          )}
          {b.kind === 'fields' && <dl class="kv">{(b.fields ?? []).map(f => <><dt>{f.label}</dt><dd><bdi>{f.value}</bdi></dd></>)}</dl>}
          {b.kind === 'link' && safeHref(b.href) && <a class="btn soft" href={safeHref(b.href)} target="_blank" rel="noopener noreferrer"><ExternalLink />{b.title}</a>}
        </Card>
      </main>
    </>
  );
}

export function Settings() {
  const t = strings.value;
  const p = prefs.value;
  const seg = <T extends string>(value: T, options: [T, string][], on: (v: T) => void) => (
    <span class="seg">{options.map(([v, label]) => <button aria-pressed={value === v} onClick={() => on(v)}>{label}</button>)}</span>
  );
  const optional = HOME_CARDS.filter(c => c.optional);
  const cardName: Record<string, string> = {
    now: t.now.title, today: t.today.title, clashes: t.clashes.title, changes: t.changes.title, alerts: t.alerts.title,
    attendance: t.attendance.title, term: t.term.title, exams: t.exams.title,
  };
  const hidden = new Set(p.hiddenCards);
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.settings.title} />
      <main class="page">
        <Card id="settings" title={t.settings.title} index={1} share={false}>
          <div>
            <div class="setting"><span>{t.settings.language}</span>{seg<Lang>(p.lang, [['ar', 'العربية'], ['en', 'English']], v => void setPrefs({ lang: v }))}</div>
            <div class="setting"><span>{t.settings.theme}</span>{seg(p.theme, [['auto', t.settings.themes.auto], ['light', t.settings.themes.light], ['dark', t.settings.themes.dark]], v => void setPrefs({ theme: v }))}</div>
            <div class="setting">
              <span>{t.settings.absenceLimit}</span>
              <span class="stepper">
                <button aria-label="−" onClick={() => void setPrefs({ absenceLimit: Math.max(5, p.absenceLimit - 5) })}>−</button>
                <b class="mono"><bdi>{p.absenceLimit}%</bdi></b>
                <button aria-label="+" onClick={() => void setPrefs({ absenceLimit: Math.min(50, p.absenceLimit + 5) })}>+</button>
              </span>
            </div>
            <label class="setting">
              <span>{t.settings.metrics}<small>{t.settings.metricsHint}</small></span>
              <input class="toggle" type="checkbox" checked={p.metrics} onChange={e => void setPrefs({ metrics: e.currentTarget.checked })} />
            </label>
          </div>
        </Card>
        <Card id="settings-cards" title={t.settings.cards} index={2} share={false}>
          <div>
            {optional.map(c => (
              <label class="setting">
                <span>{cardName[c.id] ?? c.id}</span>
                <input class="toggle" type="checkbox" checked={!hidden.has(c.id)} onChange={e => {
                  const next = new Set(hidden);
                  if (e.currentTarget.checked) next.delete(c.id); else next.add(c.id);
                  void setPrefs({ hiddenCards: [...next] });
                }} />
              </label>
            ))}
          </div>
        </Card>
        <button class="btn glass" style={{ justifySelf: 'start' }} onClick={() => void setPrefs({ welcomed: false })}>{t.settings.tour}</button>
      </main>
    </>
  );
}

export function About() {
  const t = strings.value;
  const entry = CHANGELOG[0];
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.about.title} />
      <main class="page">
        <Card id="about" title={t.appName} index={1} tone="night" hud>
          <div class="row-flex">
            <img src="/icons/icon.svg" alt="" width="56" height="56" style={{ borderRadius: '16px' }} />
            <div>
              <b style={{ fontSize: '18px' }}>{t.appName}</b>
              <p class="label mono">{t.about.version(PRODUCT.version)}</p>
            </div>
          </div>
          <p style={{ lineHeight: 1.85 }}>{t.about.what}</p>
          <p class="label" style={{ lineHeight: 1.85 }}>{t.about.readOnly}</p>
          <p class="label" style={{ lineHeight: 1.85 }}>{t.about.privacy}</p>
          <p class="label">{t.unofficial}</p>
        </Card>
        {entry && (
          <Card id="changelog" title={t.whatsNew.title(entry.version)} index={2}>
            <ul class="creed">{entry.items[lang.value].map(i => <li><span><Info /></span><span>{i}</span></li>)}</ul>
          </Card>
        )}
        <RaadAbout from={3} />
        <Card id="about-links" title={t.about.title} index={7} share={false}>
          <div class="list">
            <MenuRow href="/privacy" icon={<Info />} title={LEGAL.privacy[lang.value].title} />
            <MenuRow href="/terms" icon={<Info />} title={LEGAL.terms[lang.value].title} />
            {INSTITUTION.officialUrl && <a class="lrow" href={INSTITUTION.officialUrl} target="_blank" rel="noopener noreferrer"><span class="change-ico"><ExternalLink /></span><span class="t">{t.about.official}</span><span class="e label"><bdi class="mono">{new URL(INSTITUTION.officialUrl).host}</bdi></span></a>}
            <a class="lrow" href={PRODUCT.contact} target="_blank" rel="noopener noreferrer"><span class="change-ico"><MessageCircle /></span><span class="t">{t.about.contact}</span><span class="e label"><bdi class="mono">t.me</bdi></span></a>
          </div>
        </Card>
      </main>
    </>
  );
}

/** Privacy policy and terms. Reachable before signing in, from the sign-in screen. */
export function Legal({ doc }: { doc: 'privacy' | 'terms' }) {
  const d = LEGAL[doc][lang.value];
  const t = strings.value;
  const home = signedIn.value ? '/me/about' : '/';
  return (
    <>
      <TopBar backTo={home} crumb={signedIn.value ? <Link href={home}>{t.about.title}</Link> : undefined} title={d.title} />
      <main class="page">
        <Card id={doc} title={d.title} index={1} share={false}>
          <div class="stack legal">
            {d.sections.map(s => (
              <section>
                <h2>{s.h}</h2>
                {s.p.map(p => <p>{p}</p>)}
              </section>
            ))}
            <p class="label mono"><bdi>{UPDATED}</bdi></p>
          </div>
        </Card>
      </main>
    </>
  );
}
