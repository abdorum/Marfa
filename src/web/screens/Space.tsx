// «مساحتي»: the student's own corner, in the centre of the dock, after a game's
// character dossier. Their identity and standing as the college gives them,
// then what is theirs alone: the kit (العُدّة) and the badges. New parts join
// SECTIONS below; a section with a tab gets one in the strip at the top.
import type { ComponentChildren, FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Award, CalendarCheck, Camera, Download, FileText, GraduationCap, Hourglass, Image as ImageIcon, Link as LinkIcon, Lock, PenLine, Plus,
  Share2, ShieldCheck, Star, Trash2, Upload,
} from 'lucide-preact';
import { KIT_MAX, KIT_KINDS, NAME_MAX, TEXT_MAX, type KitItem, type KitKind } from '../../app/space';
import { attendanceLevel, BADGES, currentTerm, record, termProgress, type BadgeId } from '../../core/derive';
import { INSTITUTION } from '../../institutions';
import { Card } from '../cards/Card';
import { courseTitle } from '../cards/common';
import { dateLabel, lang, strings } from '../i18n';
import { useTick } from '../raad/RaadLine';
import { fitImage } from '../space/images';
import { endLabel, shareItem } from '../space/share';
import { photo, prefs, snapshot, space, spaceData } from '../state';
import { Sheet, toast, TopBar } from '../ui';

const PHOTO = { max: 480, bytes: 380_000, square: true };
const PICTURE = { max: 1600, bytes: 1_400_000 };
const MINUTE = 60_000;

// ---------- Identity ----------

function PhotoFrame() {
  const t = strings.value.space;
  const own = !!spaceData.value.photo;
  const input = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  const pick = async (file?: File) => {
    const url = file && await fitImage(file, PHOTO);
    if (!url || !(await space.setPhoto(url))) toast(t.photoFailed);
  };
  return (
    <div class="sp-photo">
      <span class="v" aria-hidden="true"><bdi data-private>{snapshot.value?.student?.id ?? ''}</bdi></span>
      <div class={`frame${own ? '' : ' round'}`}><img src={photo.value} alt="" /></div>
      <button class="chip ink swap" data-noshare aria-label={t.photo} onClick={() => (own ? setAsking(true) : input.current?.click())}><Camera /></button>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { void pick(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
      {asking && (
        <Sheet title={t.photo} onClose={() => setAsking(false)}>
          <button class="btn primary block" onClick={() => { setAsking(false); input.current?.click(); }}><Camera />{t.photo}</button>
          <button class="btn soft block" onClick={() => { setAsking(false); void space.setPhoto(undefined); }}>{t.photoReset}</button>
        </Sheet>
      )}
    </div>
  );
}

const IdentityCard: FunctionComponent<{ index: number }> = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.space;
  const me = strings.value.me;
  const st = s.student;
  const term = currentTerm(s);
  const limit = prefs.value.absenceLimit;
  const r = record(s, limit);
  const name = (lang.value === 'ar' ? st?.name.ar ?? st?.name.en : st?.name.en ?? st?.name.ar) ?? '—';
  const enrolled = !!term && s.sections.some(x => x.termCode === term.code);
  const scale = INSTITUTION.gpaScale ?? (r.gpa != null && r.gpa > 4 ? 5 : 4);
  const level = r.attendance != null ? attendanceLevel(100 - r.attendance, limit) : 'ok';
  return (
    <Card id="sp-identity" title={t.identity} index={index}>
      <div class="sp-top">
        <PhotoFrame />
        <div class="sp-who">
          <i class="sp-rule" aria-hidden="true" />
          <h2>{name}</h2>
          <p class="sp-status">{t.status}: <b class={enrolled ? 'ok' : ''}>{enrolled ? t.enrolled : t.noTerm}</b></p>
          {(st?.program || term?.name) && <p class="sp-type"><bdi>{[st?.program, term?.name].filter(Boolean).join(' // ')}</bdi></p>}
          <i class="sp-rule" aria-hidden="true" />
        </div>
      </div>
      <div class="sp-attrs">
        <div class="sp-attr"><span>{t.attendance}</span><div class={`meter ${level === 'ok' ? '' : level}`}><i style={{ inlineSize: `${r.attendance ?? 0}%` }} /></div><b><bdi>{r.attendance != null ? `${Math.round(r.attendance)}%` : '—'}</bdi></b></div>
        <div class="sp-attr"><span>{t.attainment}</span><div class="meter ink"><i style={{ inlineSize: `${r.gpa != null ? Math.min(100, (r.gpa / scale) * 100) : 0}%` }} /></div><b><bdi>{r.gpa != null ? r.gpa.toFixed(2) : '—'}</bdi></b></div>
        <div class="sp-attr"><span>{t.unitsPassed}</span><span class="sp-note">{r.unitsInProgress ? <bdi>{`${r.unitsInProgress} ${t.inProgress}`}</bdi> : null}</span><b><bdi>{r.unitsPassed || '—'}</bdi></b></div>
      </div>
      <p class="sp-label">{t.data}</p>
      <dl class="sp-kv">
        <dt>{me.id}</dt><dd class="mono"><bdi data-private>{st?.id ?? '—'}</bdi></dd>
        <dt>{t.college}</dt><dd><bdi>{INSTITUTION.name[lang.value]}</bdi></dd>
        {st?.email && <><dt>{me.email}</dt><dd class="mono"><bdi data-private>{st.email}</bdi></dd></>}
        {st?.phone && <><dt>{me.phone}</dt><dd class="mono"><bdi data-private>{st.phone}</bdi></dd></>}
        {st?.advisor && <><dt>{me.advisor}</dt><dd><bdi data-private>{st.advisor}</bdi></dd></>}
      </dl>
    </Card>
  );
};

// ---------- Standing ----------

const GradesCard: FunctionComponent<{ index: number }> = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.space;
  const limit = prefs.value.absenceLimit;
  const r = record(s, limit);
  const progress = termProgress(currentTerm(s), new Date(), INSTITUTION.termWeeks);
  const figure = (label: string, v?: number) => (v == null ? null : <div class="sp-fig"><b><bdi>{v.toFixed(2)}</bdi></b><span>{label}</span></div>);
  const near = r.worst && r.worst.absencePct >= limit / 2;
  return (
    <Card id="sp-grades" title={t.grades} index={index}>
      <div class="sp-figs">
        {figure(t.termGpa, r.gpa) ?? <div class="sp-fig"><b>—</b><span>{t.termGpa}</span></div>}
        {figure(t.cumulativeGpa, r.cumulativeGpa) ?? figure(t.previousGpa, r.previousGpa)}
      </div>
      {progress && (
        <>
          <p class="sp-label">{t.term}</p>
          <p class="sp-line"><span>{t.week(progress.week, progress.weeks)}</span></p>
          <div class="sp-weeks" style={{ '--n': progress.weeks }} aria-hidden="true">
            {Array.from({ length: progress.weeks }, (_, i) => <i class={i + 1 < progress.week ? 'on' : i + 1 === progress.week ? 'lit' : ''} />)}
          </div>
        </>
      )}
      {r.worst && (
        <>
          <p class="sp-label">{t.absence}</p>
          {near
            ? <p class="sp-alarm"><ShieldCheck /><span>{t.near} <bdi>{courseTitle(s, r.worst.courseKey)}</bdi>{t.comma} <bdi class="mono">{r.worst.absencePct}%</bdi> {t.ofLimit} <bdi class="mono">{limit}%</bdi></span></p>
            : <p class="alert-box ok">{t.safe}</p>}
        </>
      )}
    </Card>
  );
};

// ---------- Kit ----------

const KIND_ICON: Record<KitKind, ComponentChildren> = { link: <LinkIcon />, text: <FileText />, image: <ImageIcon />, countdown: <Hourglass /> };

function left(iso: string, now = Date.now()) {
  const ms = Date.parse(iso) - now;
  const min = Math.max(0, Math.floor(ms / MINUTE));
  return { ended: ms <= 0, days: Math.floor(min / 1440), hours: Math.floor((min % 1440) / 60), minutes: min % 60 };
}

function SlotFace({ item }: { item: KitItem }) {
  const t = strings.value.space;
  if (item.kind === 'image') return <img class="thumb" src={item.value} alt="" />;
  if (item.kind === 'countdown') {
    const l = left(item.value);
    const [n, word] = l.ended ? ['—', t.ended] : l.days ? [l.days, t.left.days(l.days)] : l.hours ? [l.hours, t.left.hours(l.hours)] : [l.minutes, t.left.minutes(l.minutes)];
    return <><span class="kind">{t.kinds.countdown}</span><span class="count"><b><bdi>{n}</bdi></b><small>{word}</small></span></>;
  }
  return <><span class="kind">{t.kinds[item.kind]}</span>{KIND_ICON[item.kind]}</>;
}

function ItemSheet({ item, onClose }: { item: KitItem; onClose: () => void }) {
  const t = strings.value.space;
  useTick(MINUTE, item.kind === 'countdown');
  const l = item.kind === 'countdown' ? left(item.value) : undefined;
  return (
    <Sheet title={<bdi>{item.name}</bdi>} onClose={onClose}>
      <span class="chip" style={{ justifySelf: 'start' }}>{t.kinds[item.kind]}</span>
      {item.kind === 'link' && <a class="sp-url" href={item.value} target="_blank" rel="noopener noreferrer"><LinkIcon /><bdi>{item.value}</bdi></a>}
      {item.kind === 'text' && <p class="sp-text"><bdi>{item.value}</bdi></p>}
      {item.kind === 'image' && <img class="sp-picture" src={item.value} alt={item.name} />}
      {l && (
        <>
          <div class="sp-cd">
            <div><b>{l.ended ? '00' : String(l.days).padStart(2, '0')}</b><span>{t.left.days(l.days)}</span></div>
            <div><b>{l.ended ? '00' : String(l.hours).padStart(2, '0')}</b><span>{t.left.hours(l.hours)}</span></div>
            <div><b>{l.ended ? '00' : String(l.minutes).padStart(2, '0')}</b><span>{t.left.minutes(l.minutes)}</span></div>
          </div>
          <p class="sp-line"><span>{l.ended ? t.ended : t.ends}</span><bdi>{endLabel(item.value)}</bdi></p>
        </>
      )}
      <div class="sp-acts">
        <button class="btn primary" onClick={() => void shareItem(item)}><Share2 />{t.share}</button>
        <button class="btn danger" onClick={() => { if (confirm(t.removeConfirm)) { void space.remove(item.id); onClose(); } }}><Trash2 />{t.remove}</button>
      </div>
    </Sheet>
  );
}

/** A local date and time for <input type="datetime-local">: a week from now, at the end of the day. */
const inAWeek = () => {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(23, 59, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * MINUTE).toISOString().slice(0, 16);
};

function AddSheet({ onClose }: { onClose: () => void }) {
  const t = strings.value.space;
  const [kind, setKind] = useState<KitKind>('link');
  const [picture, setPicture] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(f.get('name') ?? '').trim();
    if (!name) return setError(t.nameMissing);
    const raw = kind === 'image' ? picture ?? '' : kind === 'countdown' ? (f.get('value') ? new Date(String(f.get('value'))).toISOString() : '') : String(f.get('value') ?? '');
    setBusy(true);
    const item = await space.add({ kind, name, value: raw }).catch(() => undefined);
    setBusy(false);
    if (!item) return setError(spaceData.value.kit.length >= KIT_MAX ? t.full : t.invalid[kind]);
    onClose();
  };
  return (
    <Sheet title={t.addTitle} onClose={onClose}>
      <form class="sp-form" onSubmit={e => void submit(e)}>
        <div class="sp-kinds" role="radiogroup" aria-label={t.kind}>
          {KIT_KINDS.map(k => <button type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setError(undefined); }}>{KIND_ICON[k]}<span>{t.kinds[k]}</span></button>)}
        </div>
        <label class="field">{t.name}<input name="name" dir="auto" maxLength={NAME_MAX} placeholder={t.namePlaceholder} required /></label>
        {kind === 'link' && <label class="field">{t.value.link}<input name="value" type="text" inputMode="url" dir="ltr" placeholder="example.edu" autoComplete="off" required /></label>}
        {kind === 'text' && <label class="field">{t.value.text}<textarea name="value" dir="auto" rows={4} maxLength={TEXT_MAX} required /></label>}
        {kind === 'countdown' && <label class="field">{t.value.countdown}<input name="value" type="datetime-local" defaultValue={inAWeek()} required /></label>}
        {kind === 'image' && (
          <label class="field">{t.value.image}
            <span class="sp-pick">{picture ? <img src={picture} alt="" /> : <><ImageIcon />{t.pickImage}</>}</span>
            <input type="file" accept="image/*" hidden onChange={async e => {
              const file = e.currentTarget.files?.[0];
              setPicture(file ? await fitImage(file, PICTURE) : undefined);
            }} />
          </label>
        )}
        {error && <p class="alert-box" role="alert">{error}</p>}
        <button class="btn primary block" disabled={busy}><Plus />{t.add}</button>
      </form>
    </Sheet>
  );
}

function BackupSheet({ onClose }: { onClose: () => void }) {
  const t = strings.value.space;
  const input = useRef<HTMLInputElement>(null);
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([space.backup()], { type: 'application/json' }));
    a.download = `taleeb-kit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const restore = async (file?: File) => {
    if (!file) return;
    const n = await space.restore(await file.text());
    toast(n == null ? t.restoreFailed : t.restored(n));
    if (n != null) onClose();
  };
  return (
    <Sheet title={t.backupTitle} onClose={onClose}>
      <p class="label" style={{ lineHeight: 1.8 }}>{t.backupHint}</p>
      <button class="btn primary block" onClick={save}><Download />{t.save}</button>
      <button class="btn soft block" onClick={() => input.current?.click()}><Upload />{t.restore}</button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={e => { void restore(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
    </Sheet>
  );
}

const KitCard: FunctionComponent<{ index: number }> = ({ index }) => {
  const t = strings.value.space;
  const kit = spaceData.value.kit;
  const [open, setOpen] = useState<KitItem>();
  const [adding, setAdding] = useState(false);
  const [backing, setBacking] = useState(false);
  useTick(MINUTE, kit.some(i => i.kind === 'countdown'));
  const room = kit.length < KIT_MAX;
  // Empty slots fill the last row, and show a second row while the kit is short.
  const cells = Math.min(KIT_MAX, Math.max(8, Math.ceil((kit.length + 1) / 4) * 4));
  const empties = Math.max(0, cells - kit.length - (room ? 1 : 0));
  return (
    <Card id="sp-kit" title={t.kit} index={index} share={false} actions={<span class="count"><bdi>{kit.length}/{KIT_MAX}</bdi></span>}>
      <p class="label" style={{ lineHeight: 1.75 }}>{t.kitHint}</p>
      <div class="sp-kit">
        {kit.map(i => (
          <button class="sp-slot" onClick={() => setOpen(i)}>
            <span class="box"><SlotFace item={i} /></span>
            <span class="n"><bdi>{i.name}</bdi></span>
          </button>
        ))}
        {room && <button class="sp-slot empty" onClick={() => setAdding(true)}><span class="box"><Plus /></span><span class="n">{t.add}</span></button>}
        {Array.from({ length: empties }, () => <span class="sp-slot empty" aria-hidden="true"><span class="box" /></span>)}
      </div>
      <div class="sp-foot">
        <span><Lock />{t.onDevice}</span>
        <button class="btn soft sm" onClick={() => setBacking(true)}><Download />{t.backup}</button>
      </div>
      {open && <ItemSheet item={open} onClose={() => setOpen(undefined)} />}
      {adding && <AddSheet onClose={() => setAdding(false)} />}
      {backing && <BackupSheet onClose={() => setBacking(false)} />}
    </Card>
  );
};

// ---------- Badges ----------

const BADGE_ICON: Record<BadgeId, ComponentChildren> = {
  firstGrade: <PenLine />, farFromLimit: <ShieldCheck />, cleanCourse: <CalendarCheck />, gpa35: <Star />, termDone: <Award />, units30: <GraduationCap />,
};

const BadgesCard: FunctionComponent<{ index: number }> = ({ index }) => {
  const t = strings.value.space;
  const earned = record(snapshot.value!, prefs.value.absenceLimit).earned;
  // Earned ones first, so a new student sees what to aim for after what they have.
  const list = [...BADGES].sort((a, b) => Number(earned.has(b)) - Number(earned.has(a)));
  return (
    <Card id="sp-badges" title={t.badges} index={index} actions={<span class="count"><bdi>{earned.size}/{BADGES.length}</bdi></span>}>
      <div class="sp-badges">
        {list.map(b => (
          <div class={`sp-badge${earned.has(b) ? '' : ' dim'}`} title={t.badgeHow[b]}>
            <span class="b">{BADGE_ICON[b]}</span>
            <span>{t.badge[b]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ---------- The page ----------

interface Section { id: string; tab?: (t: typeof strings.value.space) => string; Card: FunctionComponent<{ index: number }> }

/** «مساحتي», in order. A new part is a new entry here. */
const SECTIONS: Section[] = [
  { id: 'sp-identity', tab: t => t.tabs.identity, Card: IdentityCard },
  { id: 'sp-grades', tab: t => t.tabs.grades, Card: GradesCard },
  { id: 'sp-kit', tab: t => t.tabs.kit, Card: KitCard },
  { id: 'sp-badges', Card: BadgesCard },
];

export function Space() {
  const t = strings.value.space;
  const [active, setActive] = useState(SECTIONS[0]!.id);
  const tabbed = SECTIONS.filter(s => s.tab);
  // The strip follows the scroll: the tab of the section in view is the lifted one.
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set((e.target as HTMLElement).dataset.card ?? '', e.isIntersecting);
      const first = tabbed.find(s => seen.get(s.id));
      if (first) setActive(first.id);
    }, { rootMargin: '-35% 0px -55% 0px' });
    for (const s of tabbed) { const el = document.querySelector(`[data-card="${s.id}"]`); if (el) io.observe(el); }
    return () => io.disconnect();
  }, []);
  return (
    <>
      <TopBar title={t.title} crumb={<span>{dateLabel(new Date())}</span>} />
      <main class="page">
        <nav class="sp-tabs" aria-label={t.title}>
          {tabbed.map(s => (
            <button aria-current={active === s.id ? 'true' : undefined} onClick={() => {
              setActive(s.id);
              document.querySelector(`[data-card="${s.id}"]`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            }}>{s.tab!(t)}</button>
          ))}
        </nav>
        {SECTIONS.map((s, i) => <s.Card key={s.id} index={i + 1} />)}
      </main>
    </>
  );
}
