// Small building blocks (Docs/06-design-system.md: المكوّنات).
import { signal } from '@preact/signals';
import type { ComponentChildren, CSSProperties } from 'preact';
import { useEffect } from 'preact/hooks';
import { BookOpen, CalendarDays, ChevronLeft, House, User } from 'lucide-preact';
import { RAAD_AVATAR } from '../../../raad/identity';
import { attendanceLevel } from '../../core/derive';
import { strings } from '../i18n';
import { back, navigate, path, tabOf } from '../router';
import { prefs, raadStatus, snapshot, type RaadStatus } from '../state';

interface LinkProps {
  href: string;
  class?: string;
  style?: CSSProperties;
  children?: ComponentChildren;
  title?: string;
  'aria-label'?: string;
  'aria-current'?: 'page';
}

/** An in-app link: a real <a>, handled by the router. */
export function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest} onClick={e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    }}>{children}</a>
  );
}

/** Points to where "back" is: left in English, right in Arabic. */
export const BackIcon = () => <ChevronLeft class="flip" aria-hidden="true" />;

export function TopBar({ title, crumb, backTo, end, wide }: { title: ComponentChildren; crumb?: ComponentChildren; backTo?: string; end?: ComponentChildren; wide?: boolean }) {
  return (
    <header class={`topbar${wide ? ' wide' : ''}`}>
      {backTo !== undefined && <button class="icon-btn" aria-label={strings.value.back} onClick={() => back(backTo)}><BackIcon /></button>}
      <div class="title">
        {crumb && <p class="crumb">{crumb}</p>}
        <h1>{title}</h1>
      </div>
      {end}
    </header>
  );
}

/** The student's picture, or their initial. */
export function Avatar({ large }: { large?: boolean }) {
  const s = snapshot.value?.student;
  const initial = (s?.firstName.ar ?? s?.firstName.en ?? s?.name.en ?? '·').slice(0, 1).toUpperCase();
  const pic = prefs.value.avatar;
  return <span class={`avatar${large ? ' lg' : ''}`} aria-hidden="true">{pic ? <img src={pic} alt="" /> : initial}</span>;
}

/** Raad's picture with his state: a ring while he works, a light for his status. */
export function RaadAvatar({ size = 40, status = raadStatus.value }: { size?: number; status?: RaadStatus }) {
  return (
    <span class={`raad-av ${status}`} style={{ inlineSize: `${size}px`, blockSize: `${size}px` }}>
      <img src={RAAD_AVATAR} alt="" width={size} height={size} />
      <i class="led" />
    </span>
  );
}

export function Meter({ pct, limit = prefs.value.absenceLimit }: { pct: number; limit?: number }) {
  // The track shows up to 1.25× the limit, so the limit mark sits at 80%.
  const scale = limit * 1.25;
  return (
    <div class={`meter ${attendanceLevel(pct, limit)}`} role="img" aria-label={`${pct}% / ${limit}%`}>
      <i style={{ inlineSize: `${Math.min(100, (pct / scale) * 100)}%` }} />
      <span class="limit" style={{ insetInlineStart: `${(limit / scale) * 100}%` }} />
    </div>
  );
}

/** Classes allowed before the limit, one chevron each; the used ones filled. */
export function Chevrons({ used, allowed, level }: { used: number; allowed: number; level: string }) {
  const n = Math.min(Math.max(allowed, 1), 24);
  const on = Math.min(n, Math.round((used / Math.max(allowed, 1)) * n));
  return <div class={`chevrons ${level}`} aria-hidden="true">{Array.from({ length: n }, (_, i) => <i class={i < on ? 'on' : ''} />)}</div>;
}

export function Ring({ value, size = 44, stroke = 5, color }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg class="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle class="track" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} />
      <circle class="value" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke}
        stroke-dasharray={c} stroke-dashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={color ? { stroke: color } : undefined} />
    </svg>
  );
}

/** The term as a ruler: a tick a week, the elapsed part lit, today marked. */
export function Ruler({ weeks, pct, start, end }: { weeks: number; pct: number; start: ComponentChildren; end: ComponentChildren }) {
  const done = Math.floor(pct * weeks);
  return (
    <div class="ruler" style={{ '--pct': pct } as CSSProperties}>
      <div class="ticks" aria-hidden="true">
        {Array.from({ length: weeks + 1 }, (_, i) => <i class={`${i % 4 === 0 ? 'major' : ''} ${i <= done ? 'done' : ''}`} />)}
      </div>
      <span class="mark" aria-hidden="true" />
      <div class="ends"><span>{start}</span><span>{end}</span></div>
    </div>
  );
}

export const Empty = ({ children }: { children: ComponentChildren }) => <p class="empty">{children}</p>;

export const Spinner = ({ label }: { label?: string }) => <span class="spin" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;

// ---------- Toast ----------
const toastText = signal<string | undefined>(undefined);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string) {
  toastText.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastText.value = undefined; }, 3200);
}

export const Toast = () => (toastText.value ? <div class="toast" role="status">{toastText.value}</div> : null);

// ---------- Sheet ----------
export function Sheet({ title, onClose, children }: { title: ComponentChildren; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return (
    <div class="scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <span class="grab" aria-hidden="true" />
        <div class="sheet-head"><h2>{title}</h2></div>
        {children}
      </section>
    </div>
  );
}

// ---------- Dock ----------
export function Dock() {
  const t = strings.value.tabs;
  const current = tabOf(path.value);
  const item = (tab: typeof current, href: string, icon: ComponentChildren, cls = '') => (
    <Link href={href} class={cls} aria-current={current === tab ? 'page' : undefined}>
      <span class="ico">{icon}</span>
      <span>{t[tab]}</span>
    </Link>
  );
  return (
    <nav class="dock" aria-label={strings.value.appName}>
      <div class="dock-in">
        {item('home', '/', <House />)}
        {item('schedule', '/schedule', <CalendarDays />)}
        {item('raad', '/raad', <RaadAvatar size={28} />, 'raad')}
        {item('courses', '/courses', <BookOpen />)}
        {item('me', '/me', <User />)}
      </div>
    </nav>
  );
}

export const componentLabel = (c: string) => strings.value.components[c] ?? c;
export const componentThe = (c: string) => strings.value.componentsThe[c] ?? c;
