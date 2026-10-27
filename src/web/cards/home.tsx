// The home board's cards (Docs/خطة النسخة 1: د1–د4, ب5). Each one is a
// widget the student can hide, and share as a picture.
import type { JSX } from 'preact';
import {
  Award, BellRing, CalendarClock, CalendarX, CheckCheck, CheckCircle2, Clock, DoorOpen, Gauge,
  ListTodo, Lock, Megaphone, Minus, Plus, Share, ShieldAlert, Smartphone, Sparkles, TrendingUp, Unlock,
} from 'lucide-preact';
import { PRODUCT } from '../../app/product';
import {
  absenceBudget, alerts, attendanceLevel, clashes, clashingMeetings, courseList, currentTerm, daysBetween,
  fromIsoDate, meetingsOn, nowAndNext, termProgress, withStates, type MeetingView,
} from '../../core/derive';
import { courseSlug, type Change } from '../../core/model';
import { INSTITUTION } from '../../institutions';
import { CHANGELOG } from '../changelog';
import { ago, dateLabel, dayName, lang, strings, time, timeRange } from '../i18n';
import { useTick } from '../raad/RaadLine';
import { courseColor, prefs, server, setPrefs, snapshot } from '../state';
import { Chevrons, componentLabel, componentThe, Empty, Link, Ring, Ruler } from '../ui';
import { Card } from './Card';
import { ClassRow, courseTitle } from './common';

type CardFn = (p: { index: number }) => JSX.Element | null;

// ---------- Now and next ----------

/**
 * The timer: a thin ring with a lit arc for what is left, round a sunken panel
 * of figures split by fine rules, each with its word beneath.
 */
function Timer({ parts, frac, small }: { parts: [number, string][]; frac?: number; small?: boolean }) {
  const v = frac == null ? 0 : Math.min(1, Math.max(0, frac));
  const r = 94;
  const len = 2 * Math.PI * r;
  return (
    <div class={`timer${small ? ' small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} class="track" />
        {v > 0 && <circle cx="100" cy="100" r={r} class="arc" stroke-dasharray={`${len * v} ${len}`} transform="rotate(-90 100 100)" />}
      </svg>
      <div class="timer-face">
        <div class="timer-panel">
          {parts.map(([n], i) => <>{i > 0 && <i class="sep" />}<b>{String(n).padStart(2, '0')}</b></>)}
        </div>
        <div class="timer-words">{parts.map(([, w]) => <span>{w}</span>)}</div>
      </div>
    </div>
  );
}

/** Seconds from now to `minute` of today. */
const secondsTo = (minute: number, now: Date) => Math.max(0, minute * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()));

function Countdown({ sec, frac }: { sec: number; frac: number }) {
  const t = strings.value.now.parts;
  return (
    <div class="nn-count">
      <Timer frac={frac} parts={[[Math.floor(sec / 3600), t.hours], [Math.floor((sec % 3600) / 60), t.minutes], [sec % 60, t.seconds]]} />
    </div>
  );
}

function DayBox({ date }: { date: Date }) {
  return (
    <div class="nn-count">
      <Timer parts={[[date.getDate(), dayName(date.getDay())]]} />
    </div>
  );
}

function Room({ room }: { room?: string }) {
  const t = strings.value.now;
  return (
    <div class="nn-room">
      <DoorOpen size={16} aria-hidden="true" />
      <small>{t.room}</small>
      {room ? <b><bdi>{room}</bdi></b> : <span class="label">{t.noRoom}</span>}
    </div>
  );
}

const Heading = ({ m }: { m: MeetingView }) => (
  <>
    <p class="nn-title"><bdi>{m.title ?? m.courseKey}</bdi></p>
    <p class="nn-sub"><bdi class="mono">{m.courseKey}</bdi><span>·</span>{componentLabel(m.component)}</p>
    <p class="nn-sub"><bdi>{timeRange(m.start, m.end)}</bdi></p>
  </>
);

export const NowNextCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.now;
  const now = new Date();
  const nn = nowAndNext(s, now);
  const cur = nn.current[0];
  const next = nn.next;
  // Seconds tick only while a timer is on the card.
  useTick(cur || next?.today ? 1000 : 30_000);

  return (
    <Card id="now" title={t.title} index={index} tone="night" hud>
      {cur ? (
        <div class="nn">
          <div class="nn-main">
            <div>
              <div class="chips"><span class="chip lime"><i class="pulse" />{t.now}</span>{nn.current.length > 1 && <span class="chip risk">{t.clash}</span>}</div>
              <Heading m={cur} />
            </div>
            <Countdown sec={secondsTo(cur.end, now)} frac={1 - cur.pct} />
          </div>
          <p class="label">{t.ends(cur.leftMin)}</p>
          <div class="nn-bar" style={{ '--p': cur.pct }}><i /></div>
          <Room room={cur.room} />
          {next && (
            <Link href={`/courses/${courseSlug(next.meeting.courseKey)}`} class="nn-next" style={{ '--c': courseColor(next.meeting.courseKey) }}>
              <i class="bar" />
              <span class="label">{t.next}</span>
              <span class="t"><bdi>{next.meeting.title ?? next.meeting.courseKey}</bdi></span>
              <span class="w">{next.today ? time(next.meeting.start) : dayName(next.date.getDay(), 'short')}</span>
            </Link>
          )}
        </div>
      ) : next ? (
        <div class="nn">
          <div class="nn-main">
            <div>
              <div class="chips">
                <span class="chip">{t.next}</span>
                {!next.today && <span class="chip">{t.on(dayName(next.date.getDay()))}</span>}
                {nn.dayOver && <span class="chip lime">{t.dayOver}</span>}
              </div>
              <Heading m={next.meeting} />
            </div>
            {next.today ? <Countdown sec={secondsTo(next.meeting.start, now)} frac={Math.min(1, next.inMin / 60)} /> : <DayBox date={next.date} />}
          </div>
          {next.today && <p class="label">{t.starts(next.inMin)}</p>}
          <Room room={next.meeting.room} />
        </div>
      ) : (
        <div class="nn-empty"><b>{nn.freeDay ? t.freeDay : t.dayOver}</b><span class="label">{t.nothing}</span></div>
      )}
    </Card>
  );
};

// ---------- Today ----------

export const TodayCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.today;
  useTick(60_000);
  const now = new Date();
  const list = withStates(meetingsOn(s, now), now);
  const clash = clashingMeetings(clashes(s));
  return (
    <Card id="today" title={t.title} index={index} actions={list.length ? <span class="count">{list.length}</span> : undefined}>
      {list.length
        ? <div class="list">{list.map(m => <ClassRow key={m.id} m={m} state={m.state} clash={clash.has(`${now.getDay()}|${m.id}`)} />)}</div>
        : <Empty>{t.empty}</Empty>}
      <div class="card-foot" data-noshare><span /><Link href="/schedule" class="link">{t.all}</Link></div>
    </Card>
  );
};

// ---------- Clashes ----------

export const ClashesCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.clashes;
  const list = clashes(s);
  if (!list.length) return null;
  const side = (key: string, component?: string) => (
    <div class="lrow" style={{ '--c': courseColor(key) }}>
      <i class="bar" />
      <span class="t"><bdi>{courseTitle(s, key)}</bdi></span>
      <span class="m"><bdi class="mono">{key}</bdi>{component ? ` · ${componentLabel(component)}` : ''}</span>
    </div>
  );
  return (
    <Card id="clashes" title={t.title} index={index} class="tone-risk" actions={<span class="chip risk"><ShieldAlert />{t.count(list.length)}</span>}>
      <div class="list">
        {list.map(c => (
          <div class="clash">
            <p class="clash-when">
              {c.kind === 'class' ? <b>{dayName(c.day)}</b> : <b>{t.exams} · {dateLabel(fromIsoDate(c.date), { weekday: 'long', day: 'numeric', month: 'long' })}</b>}
              <bdi class="mono">{timeRange(c.start, c.end)}</bdi>
            </p>
            {side(c.a.courseKey, c.kind === 'class' ? c.a.component : undefined)}
            {side(c.b.courseKey, c.kind === 'class' ? c.b.component : undefined)}
          </div>
        ))}
      </div>
      <p class="label">{t.hint}</p>
    </Card>
  );
};

// ---------- What's new (changes since the last refresh) ----------

const CHANGE_ICONS: Record<Change['kind'], typeof Award> = {
  grade: Award, absence: TrendingUp, room: DoorOpen, time: Clock, 'class-added': Plus, 'class-removed': Minus,
  'exam-added': CalendarClock, 'exam-changed': CalendarClock, 'exam-removed': CalendarX,
  'hold-added': Lock, 'hold-removed': Unlock, 'todo-added': ListTodo, 'todo-removed': CheckCheck, gpa: Gauge,
};

function changeParts(c: Change): { title: string; text: string; color?: string } {
  const s = snapshot.value!;
  const t = strings.value.changes;
  const date = (iso: string, start?: number) => `${dateLabel(fromIsoDate(iso), { weekday: 'long', day: 'numeric', month: 'long' })}${start != null ? ` · ${time(start)}` : ''}`;
  switch (c.kind) {
    case 'grade': return { title: courseTitle(s, c.courseKey), text: t.grade(c.to, c.from), color: courseColor(c.courseKey) };
    case 'absence': return { title: courseTitle(s, c.courseKey), text: t.absence(c.to), color: courseColor(c.courseKey) };
    case 'room': return { title: courseTitle(s, c.courseKey), text: t.room(componentThe(c.component), c.to), color: courseColor(c.courseKey) };
    case 'time': return { title: courseTitle(s, c.courseKey), text: t.time(componentThe(c.component)), color: courseColor(c.courseKey) };
    case 'class-added': return { title: courseTitle(s, c.courseKey), text: t.classAdded(componentThe(c.component)), color: courseColor(c.courseKey) };
    case 'class-removed': return { title: courseTitle(s, c.courseKey), text: t.classRemoved(componentThe(c.component)), color: courseColor(c.courseKey) };
    case 'exam-added': return { title: courseTitle(s, c.courseKey), text: t.examAdded(date(c.date, c.start)), color: courseColor(c.courseKey) };
    case 'exam-changed': return { title: courseTitle(s, c.courseKey), text: t.examChanged(date(c.date, c.start)), color: courseColor(c.courseKey) };
    case 'exam-removed': return { title: courseTitle(s, c.courseKey), text: t.examRemoved, color: courseColor(c.courseKey) };
    case 'hold-added': return { title: t.holdAdded, text: c.title };
    case 'hold-removed': return { title: t.holdRemoved, text: c.title };
    case 'todo-added': return { title: t.todoAdded, text: c.title };
    case 'todo-removed': return { title: t.todoRemoved, text: c.title };
    case 'gpa': return { title: t.gpaTitle, text: t.gpa(c.to.toFixed(2)) };
  }
}

export const ChangesCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.changes;
  const seenAt = prefs.value.changesSeenAt;
  const isNew = (c: Change) => !seenAt || c.at > seenAt;
  const unseen = s.changes.filter(isNew).length;
  return (
    <Card id="changes" title={t.title} index={index} actions={unseen ? <span class="chip lime"><Sparkles />{t.newCount(unseen)}</span> : undefined}>
      {s.changes.length ? (
        <ul class="list">
          {s.changes.slice(0, 8).map(c => {
            const p = changeParts(c);
            const Icon = CHANGE_ICONS[c.kind];
            return (
              <li class={`lrow change${isNew(c) ? ' fresh' : ''}`} style={p.color ? { '--c': p.color } : undefined}>
                <span class="change-ico"><Icon aria-hidden="true" /></span>
                <span class="t"><bdi>{p.title}</bdi></span>
                <span class="m"><bdi>{p.text}</bdi></span>
                <span class="e label">{isNew(c) && <span class="chip lime fresh-tag">{t.fresh}</span>}{ago(c.at)}</span>
              </li>
            );
          })}
        </ul>
      ) : <Empty>{t.empty}</Empty>}
      {unseen > 0 && (
        <div class="card-foot" data-noshare>
          <span />
          <button class="btn sm soft" onClick={() => void setPrefs({ changesSeenAt: new Date().toISOString() })}><CheckCheck />{t.seen}</button>
        </div>
      )}
    </Card>
  );
};

// ---------- Alerts ----------

export const AlertsCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.alerts;
  const now = new Date();
  // Clashes have a card of their own.
  const list = alerts(s, prefs.value, now).filter(a => a.kind !== 'clash');
  return (
    <Card id="alerts" title={t.title} index={index} actions={list.length ? <span class="count">{list.length}</span> : undefined}>
      {list.length ? (
        <div class="list">
          {list.map(a => {
            if (a.kind === 'attendance' || a.kind === 'barred') {
              const key = a.record.courseKey;
              return (
                <Link href={`/courses/${courseSlug(key)}`} class="lrow" style={{ '--c': courseColor(key) }}>
                  <i class="bar" />
                  <span class="t"><bdi>{courseTitle(s, key)}</bdi></span>
                  <span class="m">{a.kind === 'barred' ? <bdi>{a.record.examStatus}</bdi> : a.level === 'risk' ? t.risk : t.warn}</span>
                  <span class="e"><span class={`chip ${a.kind === 'barred' ? 'risk' : a.level}`}>{a.kind === 'barred' ? t.barred : <bdi>{a.record.absencePct}%</bdi>}</span></span>
                </Link>
              );
            }
            if (a.kind === 'exam') {
              const key = a.exam.courseKey;
              return (
                <Link href={`/courses/${courseSlug(key)}`} class="lrow" style={{ '--c': courseColor(key) }}>
                  <i class="bar" />
                  <span class="t"><bdi>{courseTitle(s, key)}</bdi></span>
                  <span class="m">{t.exam(a.inDays)}{a.exam.start != null && <> · <bdi>{time(a.exam.start)}</bdi></>}{a.exam.room && <> · <bdi class="mono">{a.exam.room}</bdi></>}</span>
                  <span class="e"><CalendarClock size={18} aria-hidden="true" /></span>
                </Link>
              );
            }
            if (a.kind === 'hold' || a.kind === 'todo') {
              return (
                <Link href="/me/notices" class="lrow" style={{ '--c': a.kind === 'hold' ? 'var(--risk)' : 'var(--accent)' }}>
                  <i class="bar" />
                  <span class="t"><bdi>{a.notice.title}</bdi></span>
                  <span class="m">{a.kind === 'hold' ? t.hold : t.todo}</span>
                  <span class="e">{a.kind === 'hold' ? <Lock size={18} aria-hidden="true" /> : <ListTodo size={18} aria-hidden="true" />}</span>
                </Link>
              );
            }
            return null;
          })}
        </div>
      ) : <p class="row-flex muted"><CheckCircle2 size={18} class="ok" aria-hidden="true" />{t.none}</p>}
    </Card>
  );
};

// ---------- Attendance ----------

export const AttendanceCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.attendance;
  const limit = prefs.value.absenceLimit;
  const rows = courseList(s, prefs.value).filter(r => r.attendance);
  if (!rows.length) return null;
  const worst = rows[0]!;
  const budget = absenceBudget(s, worst.course.key, worst.attendance!.absencePct, limit, INSTITUTION.termWeeks);
  return (
    <Card id="attendance" title={t.title} index={index} actions={<span class="chip">{t.limit(limit)}</span>}>
      <div class="rings">
        {rows.map(r => {
          const pct = r.attendance!.absencePct;
          const level = attendanceLevel(pct, limit);
          return (
            <Link href={`/courses/${courseSlug(r.course.key)}`} class="ring-tile" aria-label={`${r.course.title ?? r.course.key}: ${pct}%`}>
              <span class="ring-wrap">
                <Ring value={pct / limit} size={58} stroke={6} color={level === 'ok' ? courseColor(r.course.key) : `var(--${level})`} />
                <b class={level === 'ok' ? '' : level}><bdi>{Math.round(pct)}%</bdi></b>
              </span>
              <small><bdi>{r.course.subject}</bdi></small>
            </Link>
          );
        })}
      </div>
      {budget && worst.attendance!.absencePct > 0 && (
        <div class="budget">
          <p class="row-flex"><span class="dot-c" style={{ background: courseColor(worst.course.key) }} /><b><bdi>{worst.course.title ?? worst.course.key}</bdi></b></p>
          <Chevrons used={budget.used} allowed={budget.allowed} level={worst.level} />
          <p class="label">{t.left(budget.left, budget.leftAtMost)}</p>
        </div>
      )}
    </Card>
  );
};

// ---------- Term ----------

export const TermCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.term;
  const term = currentTerm(s);
  const progress = termProgress(term, new Date(), INSTITUTION.termWeeks);
  const rows = courseList(s, prefs.value);
  const units = rows.reduce((n, r) => n + (r.course.units ?? r.grade?.units ?? 0), 0);
  const graded = rows.filter(r => r.grade?.grade).length;
  const gpa = s.termStats.find(x => x.termCode === term?.code)?.gpa;
  return (
    <Card id="term" title={term?.name ? <bdi>{term.name}</bdi> : t.title} index={index}>
      {progress && (
        <div>
          <p class="row-flex"><b class="mono">{t.week(progress.week, progress.weeks, progress.approximate)}</b></p>
          <Ruler weeks={progress.weeks} pct={progress.pct} start={term?.start ? dateLabel(fromIsoDate(term.start), { day: 'numeric', month: 'short' }) : ''} end={term?.end ? dateLabel(fromIsoDate(term.end), { day: 'numeric', month: 'short' }) : `${progress.weeks}`} />
        </div>
      )}
      <div class="stats">
        <div class="stat"><b>{gpa != null ? gpa.toFixed(2) : '—'}</b><span>{t.gpa}{gpa != null && INSTITUTION.gpaScale ? ` ${t.of(INSTITUTION.gpaScale)}` : ''}</span></div>
        <div class="stat"><b>{units || '—'}</b><span>{t.units}</span></div>
        <div class="stat"><b><bdi>{graded}/{rows.length}</bdi></b><span>{t.graded}</span></div>
        <div class="stat"><b>{rows.length}</b><span>{t.courses}</span></div>
      </div>
    </Card>
  );
};

// ---------- Exams ----------

export const ExamsCard: CardFn = ({ index }) => {
  const s = snapshot.value!;
  const t = strings.value.exams;
  const now = new Date();
  const term = currentTerm(s)?.code;
  const coming = s.exams
    .filter(e => (!term || e.termCode === term) && daysBetween(now, fromIsoDate(e.date)) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 0) - (b.start ?? 0));
  const first = coming[0];
  return (
    <Card id="exams" title={t.title} index={index}>
      {first ? (
        <>
          <div class="exam-hero" style={{ '--c': courseColor(first.courseKey) }}>
            <Timer small parts={[[daysBetween(now, fromIsoDate(first.date)), t.unit(daysBetween(now, fromIsoDate(first.date)))]]} />
            <div class="exam-what">
              <b><bdi>{courseTitle(s, first.courseKey)}</bdi></b>
              <span class="label">{dateLabel(fromIsoDate(first.date))}{first.start != null && <> · <bdi>{timeRange(first.start, first.end)}</bdi></>}</span>
              {first.room && <span class="label"><bdi class="mono">{first.room}</bdi></span>}
            </div>
          </div>
          {coming.slice(1, 4).map(e => (
            <Link href={`/courses/${courseSlug(e.courseKey)}`} class="lrow" style={{ '--c': courseColor(e.courseKey) }}>
              <i class="bar" />
              <span class="t"><bdi>{courseTitle(s, e.courseKey)}</bdi></span>
              <span class="m">{dateLabel(fromIsoDate(e.date), { weekday: 'short', day: 'numeric', month: 'short' })}{e.start != null && <> · <bdi>{time(e.start)}</bdi></>}</span>
              <span class="e label">{t.in(daysBetween(now, fromIsoDate(e.date)))}</span>
            </Link>
          ))}
        </>
      ) : <Empty>{t.empty}</Empty>}
    </Card>
  );
};

// ---------- Notes: the owner's announcement, install, what's new ----------

export const NoticeCard: CardFn = ({ index }) => {
  const text = noticeText();
  if (!text) return null;
  return (
    <Card id="notice" title={strings.value.notice.title} index={index} share={false} actions={<Megaphone size={20} aria-hidden="true" />}>
      <p style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}><bdi>{text}</bdi></p>
    </Card>
  );
};

/** iOS Safari, not installed: Safari wipes a site's data after a week away. */
export const isIosSafariTab = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && !matchMedia('(display-mode: standalone)').matches;

export const InstallCard: CardFn = ({ index }) => {
  const t = strings.value.install;
  if (prefs.value.installHintDismissed || !isIosSafariTab()) return null;
  return (
    <Card id="install" title={t.title} index={index} share={false} actions={<Smartphone size={20} aria-hidden="true" />}>
      <p class="label" style={{ lineHeight: 1.8 }}>{t.body}</p>
      <ol class="list">
        <li class="lrow"><span class="change-ico"><Share aria-hidden="true" /></span><span class="t">{t.steps[0]}</span></li>
        <li class="lrow"><span class="change-ico"><Plus aria-hidden="true" /></span><span class="t">{t.steps[1]}</span></li>
      </ol>
      <div class="card-foot"><span /><button class="btn sm soft" onClick={() => void setPrefs({ installHintDismissed: true })}>{t.dismiss}</button></div>
    </Card>
  );
};

export const WhatsNewCard: CardFn = ({ index }) => {
  const t = strings.value.whatsNew;
  const seen = prefs.value.lastSeenVersion;
  if (!seen || seen === PRODUCT.version) return null;
  const entry = CHANGELOG.find(e => e.version === PRODUCT.version);
  if (!entry) return null;
  return (
    <Card id="whats-new" title={t.title(PRODUCT.version)} index={index} tone="night" hud share={false} actions={<BellRing size={20} aria-hidden="true" />}>
      <ul class="creed">{entry.items[lang.value].map(i => <li><span><Sparkles /></span><span>{i}</span></li>)}</ul>
      <div class="card-foot"><span /><button class="btn sm primary" onClick={() => void setPrefs({ lastSeenVersion: PRODUCT.version })}>{t.dismiss}</button></div>
    </Card>
  );
};

const noticeText = () => {
  const n = server.value?.notice;
  return n?.[lang.value] ?? n?.ar ?? n?.en;
};

/** The home board's cards in order. `show` says when a card has something to say; `optional` ones the student may hide. */
export const HOME_CARDS: { id: string; card: CardFn; optional?: boolean; show?: () => boolean }[] = [
  { id: 'notice', card: NoticeCard, show: () => !!noticeText() },
  { id: 'install', card: InstallCard, show: () => !prefs.value.installHintDismissed && isIosSafariTab() },
  { id: 'whats-new', card: WhatsNewCard, show: () => !!prefs.value.lastSeenVersion && prefs.value.lastSeenVersion !== PRODUCT.version },
  { id: 'now', card: NowNextCard, optional: true },
  { id: 'today', card: TodayCard, optional: true },
  { id: 'clashes', card: ClashesCard, optional: true, show: () => clashes(snapshot.value!).length > 0 },
  { id: 'changes', card: ChangesCard, optional: true },
  { id: 'alerts', card: AlertsCard, optional: true },
  { id: 'attendance', card: AttendanceCard, optional: true, show: () => snapshot.value!.attendance.length > 0 },
  { id: 'term', card: TermCard, optional: true },
  { id: 'exams', card: ExamsCard, optional: true },
];
