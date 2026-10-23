import { Info, LogOut, Send, Settings as Gear, Shuffle } from 'lucide-preact';
import type { ExtraBlock } from '../../core/model';
import { lang, strings, type Lang } from '../i18n';
import { navigate } from '../router';
import { avatar, avatars, prefs, setPrefs, signOut, snapshot, type Theme } from '../store/app';
import { Avatar, Empty, Link, Row, Tile, TopBar } from '../ui';

const TELEGRAM = 'https://t.me/ItsProf11';

export function Me() {
  const s = snapshot.value!;
  const t = strings.value;
  const st = s.student;
  const name = (prefs.value.lang === 'ar' ? st?.name.ar ?? st?.name.en : st?.name.en ?? st?.name.ar) ?? '—';
  const nextAvatar = () => {
    const list = avatars.value;
    if (!list.length) return;
    const i = list.indexOf(avatar.value ?? '');
    void setPrefs({ avatar: list[(i + 1) % list.length] });
  };

  return (
    <>
      <TopBar title={t.tabs.me} end={<span />} />
      <div class="page">
        <div class="stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
          <button onClick={nextAvatar} aria-label={t.settings.avatar} style={{ border: 0, background: 'none', padding: 0, position: 'relative' }}>
            <Avatar large />
            {avatars.value.length > 1 && <span class="icon-btn" style={{ position: 'absolute', insetInlineEnd: '-6px', insetBlockEnd: '-6px', inlineSize: '32px', blockSize: '32px' }}><Shuffle /></span>}
          </button>
          <h2 style={{ fontSize: '22px', fontWeight: 500 }}>{name}</h2>
          <p class="label">{[st?.program, st?.institution].filter(Boolean).join(' · ')}</p>
        </div>

        <div class="card">
          <dl class="kv">
            <dt>{t.me.id}</dt><dd><bdi>{st?.id ?? '—'}</bdi></dd>
            {st?.email && <><dt>{t.me.email}</dt><dd><bdi>{st.email}</bdi></dd></>}
            {st?.phone && <><dt>{t.me.phone}</dt><dd><bdi>{st.phone}</bdi></dd></>}
            <dt>{t.me.advisor}</dt><dd>{st?.advisor ?? '—'}</dd>
          </dl>
        </div>

        <div class="tiles">
          <Tile href="/me/notices" value={s.holds.length} label={t.me.holds} />
          <Tile href="/me/notices" value={s.todos.length} label={t.me.todos} />
          <Tile href="/me/more" value={s.extras.length} label={t.me.more} />
        </div>

        <div class="stack">
          <Row href="/me/settings" title={t.me.settings} end={<Gear />} />
          <Row href="/me/about" title={t.me.about} end={<Info />} />
          <button class="row" onClick={async () => { if (confirm(t.me.signOutConfirm)) { await signOut(); navigate('/', { replace: true }); } }}>
            <i class="dot" /><span class="t danger">{t.me.signOut}</span><span class="end danger"><LogOut /></span>
          </button>
        </div>
      </div>
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
      <div class="page stack">
        {all.map(n => <Row state={n.kind === 'hold' ? 'now' : undefined} title={n.title} meta={n.kind === 'hold' ? t.alert.hold : t.alert.todo} />)}
        {!all.length && <Empty>{t.notices.none}</Empty>}
      </div>
    </>
  );
}

export function Settings() {
  const t = strings.value;
  const p = prefs.value;
  const seg = <T extends string>(value: T, options: [T, string][], on: (v: T) => void) => (
    <span class="seg">{options.map(([v, label]) => <button aria-pressed={value === v} onClick={() => on(v)}>{label}</button>)}</span>
  );
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.settings.title} />
      <div class="page">
        <div class="card stack">
          <div class="switch"><span>{t.settings.language}</span>{seg<Lang>(p.lang, [['ar', 'العربية'], ['en', 'English']], v => void setPrefs({ lang: v }))}</div>
          <div class="switch"><span>{t.settings.theme}</span>{seg<Theme>(p.theme, [['auto', t.settings.auto], ['light', t.settings.light], ['dark', t.settings.dark]], v => void setPrefs({ theme: v }))}</div>
          <div class="switch">
            <span>{t.settings.absenceLimit}</span>
            <span class="stepper">
              <button class="icon-btn" aria-label="−" onClick={() => void setPrefs({ absenceLimit: Math.max(5, p.absenceLimit - 5) })}>−</button>
              <bdi class="num">{p.absenceLimit}%</bdi>
              <button class="icon-btn" aria-label="+" onClick={() => void setPrefs({ absenceLimit: Math.min(50, p.absenceLimit + 5) })}>+</button>
            </span>
          </div>
          <label class="switch check"><span>{t.settings.metrics}</span><input type="checkbox" checked={p.metrics} onChange={e => void setPrefs({ metrics: e.currentTarget.checked })} /></label>
        </div>
      </div>
    </>
  );
}

export function About() {
  const t = strings.value;
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.about.title} />
      <div class="page">
        <div class="card stack">
          <h2 style={{ fontSize: '18px', fontWeight: 500 }}><bdi>{t.about.name}</bdi></h2>
          <p>{t.about.what}</p>
          <p class="label">{t.about.privacy}</p>
          <p class="label">{t.about.unofficial}</p>
        </div>
        <a class="pill solid" href={TELEGRAM} target="_blank" rel="noopener" style={{ justifySelf: 'start' }}><Send /> {t.about.contact}</a>
      </div>
    </>
  );
}

export function More() {
  const s = snapshot.value!;
  const t = strings.value;
  return (
    <>
      <TopBar backTo="/me" crumb={<Link href="/me">{t.tabs.me}</Link>} title={t.more.title} />
      <div class="page stack">
        {s.extras.map(b => <Row href={`/me/more/${encodeURIComponent(b.id)}`} title={blockTitle(b)} end={<bdi class="label">{b.rows?.length ?? b.fields?.length ?? ''}</bdi>} />)}
        {!s.extras.length && <Empty>{t.more.none}</Empty>}
      </div>
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
      <TopBar backTo="/me/more" crumb={<Link href="/me/more">{t.more.title}</Link>} title={blockTitle(b)} />
      <div class="page">
        {b.kind === 'table' && b.columns && (
          <table class="table">
            <thead><tr>{b.columns.map(c => <th>{c}</th>)}</tr></thead>
            <tbody>{(b.rows ?? []).map(r => <tr>{r.map((cell, i) => <td data-h={b.columns![i] ?? ''}>{cell}</td>)}</tr>)}</tbody>
          </table>
        )}
        {b.kind === 'fields' && (
          <div class="card"><dl class="kv">{(b.fields ?? []).map(f => <><dt>{f.label}</dt><dd>{f.value}</dd></>)}</dl></div>
        )}
        {b.kind === 'link' && b.href && <a class="pill" href={b.href} target="_blank" rel="noopener">{b.title}</a>}
      </div>
    </>
  );
}

const blockTitle = (b: ExtraBlock) => b.titles?.[lang.value] ?? b.titles?.ar ?? b.titles?.en ?? b.title;
