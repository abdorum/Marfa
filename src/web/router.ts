// A small History API router: every screen has a real URL (ADR-010).
import { signal } from '@preact/signals';

export const path = signal(location.pathname);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === path.value) return;
  // Entries the app pushes are marked, so "back" knows it can go back.
  history[opts.replace ? 'replaceState' : 'pushState']({ inApp: !opts.replace || history.state?.inApp }, '', to + location.search);
  path.value = to;
  window.scrollTo(0, 0);
}

export function back(fallback = '/') {
  if (history.state?.inApp && history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

window.addEventListener('popstate', () => { path.value = location.pathname; });

/** "/courses/:slug" against "/courses/PYBIO-101" → { slug: "PYBIO-101" } */
export function match(pattern: string, p = path.value): Record<string, string> | undefined {
  const a = pattern.split('/').filter(Boolean);
  const b = p.split('/').filter(Boolean);
  if (a.length !== b.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.startsWith(':')) params[a[i]!.slice(1)] = decodeURIComponent(b[i]!);
    else if (a[i] !== b[i]) return undefined;
  }
  return params;
}

export type Tab = 'home' | 'schedule' | 'space' | 'courses' | 'me';

/** Which dock tab a path belongs to. Raad's page is reached from «المزيد». */
export function tabOf(p: string): Tab {
  const first = p.split('/')[1] ?? '';
  if (first === 'calendar') return 'schedule';
  if (first === 'raad') return 'me';
  return first === 'schedule' || first === 'space' || first === 'courses' || first === 'me' ? first : 'home';
}
