// Language, direction and formatting. Latin digits and the Gregorian
// calendar in both languages (ADR-012).
import { computed, signal } from '@preact/signals';
import { ar, en, type Strings } from './strings';

export type Lang = 'ar' | 'en';

export const lang = signal<Lang>('ar');
export const strings = computed<Strings>(() => (lang.value === 'ar' ? ar : en));
export const dir = computed(() => (lang.value === 'ar' ? 'rtl' : 'ltr'));

const locale = () => (lang.value === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

/** 960 → "4:00 م" / "4:00 PM" */
export function time(minutes: number | undefined): string {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  const suffix = lang.value === 'ar' ? (h < 12 ? 'ص' : 'م') : h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${m} ${suffix}`;
}

export const timeRange = (a?: number, b?: number) => `${time(a)} – ${time(b)}`;

export function dayName(day: number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  // 2026-10-18 is a Sunday.
  return new Intl.DateTimeFormat(locale(), { weekday: style }).format(new Date(2026, 9, 18 + day));
}

export function dateLabel(d: Date, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat(locale(), opts).format(d);
}

export const monthLabel = (d: Date) => dateLabel(d, { month: 'long', year: 'numeric' });

export function minutesAgo(iso: string | undefined, now = new Date()): number | undefined {
  return iso ? Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000)) : undefined;
}

export function applyDocumentLang() {
  document.documentElement.lang = lang.value;
  document.documentElement.dir = dir.value;
  document.title = strings.value.appName;
}
