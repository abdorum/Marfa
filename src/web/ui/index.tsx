// Design system components (Docs/06-design-system.md#ط§ظ„ظ…ظƒظˆظ‘ظ†ط§طھ).
import type { ComponentChildren } from 'preact';
import { ArrowLeft, Bell, BookOpen, CalendarDays, ChevronLeft, House, User, Zap } from 'lucide-preact';
import { attendanceLevel } from '../../core/derive';
import { dir, strings } from '../i18n';
import { back, navigate, path, tabOf } from '../router';
import { avatar, prefs, raadStatus, snapshot } from '../store/app';

type LinkProps = {
  href: string;
  class?: string;
  children: ComponentChildren;
  style?: Record<string, string | number>;
  'aria-label'?: string;
  'aria-current'?: 'page';
};

export function Link({ href, class: cls, children, ...rest }: LinkProps) {
  return (
    <a href={href} class={cls} {...rest} onClick={e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    }}>{children}</a>
  );
}

/** Points to where "back" is: left in English, right in Arabic (CSS flips it). */
export const BackIcon = () => <ChevronLeft class="flip" />;

/** "â†’" for "go on", mirrored in Arabic. */
export const Forward = () => <ArrowLeft class={dir.value === 'rtl' ? '' : 'flip-ltr'} aria-hidden="true" />;

export function TopBar({ title, crumb, backTo, end }: { title: ComponentChildren; crumb?: ComponentChildren; backTo?: string; end?: ComponentChildren }) {
  return (
    <header class="topbar">
      {backTo !== undefined && <button class="icon-btn" aria-label={strings.value.back} onClick={() => back(backTo)}><BackIcon /></button>}
      <div class="title">
        {crumb && <p class="crumb">{crumb}</p>}
        <h1>{title}</h1>
      </div>
      {end ?? <AvatarLink />}
    </header>
  );
}

export function Avatar({ large }: { large?: boolean }) {
  const s = snapshot.value?.student;
  const initials = (s?.firstName.en ?? s?.firstName.ar ?? s?.name.en ?? '?').slice(0, 1).toUpperCase();
  return (
    <span class={`avatar${large ? ' lg' : ''}`} aria-hidden="true">
      {avatar.value ? <img src={avatar.value} alt="" /> : initials}
    </span>
  );
}

export const AvatarLink = () => <Link href="/me" aria-label={strings.value.tabs.me}><Avatar /></Link>;

export function Notice({ icon = <Bell />, tone, children, href }: { icon?: ComponentChildren; tone?: 'risk'; children: ComponentChildren; href?: string }) {
  const inner = <><span class="bubble">{icon}</span><p>{children}</p></>;
  return href
    ? <Link href={href} class={`card notice${tone ? ` ${tone}` : ''}`}>{inner}</Link>
    : <div class={`card notice${tone ? ` ${tone}` : ''}`} role="status">{inner}</div>;
}

export function Row({ title, meta, end, state, href, outlined }: { title: ComponentChildren; meta?: ComponentChildren; end?: ComponentChildren; state?: string; href?: string; outlined?: boolean }) {
  const cls = `row${outlined ? ' outlined' : ''}${state ? ` ${state}` : ''}`;
  const inner = <><i class="dot" /><span class="t">{title}</span>{end != null && <span class="end">{end}</span>}{meta != null && <span class="m">{meta}</span>}</>;
  return href ? <Link href={href} class={cls}>{inner}</Link> : <div class={cls}>{inner}</div>;
}

export function Tile({ value, label, href }: { value: ComponentChildren; label: ComponentChildren; href?: string }) {
  const inner = <><b>{value}</b><span>{label}</span></>;
  return href ? <Link href={href} class="tile">{inner}</Link> : <div class="tile">{inner}</div>;
}

export function Meter({ pct }: { pct: number }) {
  const limit = prefs.value.absenceLimit;
  // The track shows up to 1.25أ— the limit, so the limit mark sits at 80%.
  const scale = limit * 1.25;
  const level = attendanceLevel(pct, limit);
  return (
    <div class={`meter ${level}`} role="img" aria-label={`${pct}% / ${limit}%`}>
      <i style={{ inlineSize: `${Math.min(100, (pct / scale) * 100)}%` }} />
      <span class="limit" style={{ insetInlineStart: `${(limit / scale) * 100}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty">{children}</p>;
}

export function BottomNav() {
  const t = strings.value.tabs;
  const current = tabOf(path.value);
  const status = raadStatus.value;
  const item = (tab: typeof current, href: string, icon: ComponentChildren, cls = '') => (
    <Link href={href} class={cls} aria-label={t[tab]} aria-current={current === tab ? 'page' : undefined}>{icon}</Link>
  );
  return (
    <nav class="nav" aria-label={strings.value.appName}>
      {item('home', '/', <House />)}
      {item('calendar', '/calendar', <CalendarDays />)}
      {item('raad', '/raad', <><Zap /><i class="badge" /></>, `raad ${status}`)}
      {item('courses', '/courses', <BookOpen />)}
      {item('me', '/me', <User />)}
    </nav>
  );
}

export const componentLabel = (c: string) => strings.value.components[c] ?? c;
