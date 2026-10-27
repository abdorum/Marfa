// The owner's switches: pause Raad, an announcement, parts not to read, and how
// often devices refresh. Set from the owner's page (/admin/) and kept in KV
// under one key. The Worker variables of the same meaning (RAAD_PAUSED,
// NOTICE_AR…) still work beside them, so the Cloudflare dashboard stays a way
// in when the page cannot be reached (RUNBOOK.md).
import type { Localized } from '../../src/core/model';
import { GuardUnavailable, type Store } from './guard';

export interface Switches {
  paused?: boolean;
  /** Why, shown to the students while paused. */
  message?: Localized;
  /** An announcement every student sees. */
  notice?: Localized;
  /** Parts not to read, e.g. a page that began to end sessions. */
  skip?: string[];
  /** How old data may get before devices refresh it on their own (exam weeks: raise it). */
  staleMinutes?: number;
  /** When the owner last changed them (ISO time). */
  at?: string;
}

/** The switches in effect: the page's and the dashboard's together. */
export interface Effective {
  paused: boolean;
  message?: Localized;
  notice?: Localized;
  skip: Set<string>;
  staleMinutes?: number;
}

/** The dashboard's variables (raad/server/router.ts: Env). */
export interface SwitchVars {
  RAAD_PAUSED?: string;
  RAAD_MESSAGE_AR?: string;
  RAAD_MESSAGE_EN?: string;
  NOTICE_AR?: string;
  NOTICE_EN?: string;
  RAAD_DISABLE_PAGES?: string;
  RAAD_STALE_MINUTES?: string;
}

export const MAX_MESSAGE = 200;
export const MAX_NOTICE = 300;
const KEY = 'switches';

export const localized = (ar?: string, en?: string): Localized | undefined => (ar || en ? { ar: ar || undefined, en: en || undefined } : undefined);
const stale = (n: unknown) => (Number.isInteger(n) && (n as number) >= 5 && (n as number) <= 24 * 60 ? (n as number) : undefined);

export async function readSwitches(store: Store | undefined): Promise<Switches> {
  if (!store) return {};
  let raw: string | null;
  try {
    raw = await store.get(KEY);
  } catch {
    throw new GuardUnavailable('GUARD');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Switches;
  } catch {
    return {};
  }
}

export async function writeSwitches(store: Store, s: Switches): Promise<void> {
  try {
    await store.put(KEY, JSON.stringify(s));
  } catch {
    throw new GuardUnavailable('GUARD');
  }
}

/** The same switches, as Worker variables set in the Cloudflare dashboard. */
export function dashboardSwitches(vars: SwitchVars): Switches {
  const skip = (vars.RAAD_DISABLE_PAGES ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    paused: /^(1|true|yes)$/i.test(vars.RAAD_PAUSED ?? '') || undefined,
    message: localized(vars.RAAD_MESSAGE_AR, vars.RAAD_MESSAGE_EN),
    notice: localized(vars.NOTICE_AR, vars.NOTICE_EN),
    skip: skip.length ? skip : undefined,
    staleMinutes: stale(Number(vars.RAAD_STALE_MINUTES)),
  };
}

/** Either one pauses; the page's words come first; a part skipped by either is skipped. */
export function combine(page: Switches, dashboard: Switches): Effective {
  const paused = !!(page.paused || dashboard.paused);
  return {
    paused,
    message: paused ? (page.paused ? page.message : undefined) ?? (dashboard.paused ? dashboard.message : undefined) : undefined,
    notice: page.notice ?? dashboard.notice,
    skip: new Set([...(dashboard.skip ?? []), ...(page.skip ?? [])]),
    staleMinutes: stale(page.staleMinutes) ?? dashboard.staleMinutes,
  };
}

/** Plain text of at most `max` characters: undefined when empty, null when it is not text or too long. */
function text(v: unknown, max: number): string | undefined | null {
  if (v == null) return undefined;
  if (typeof v !== 'string') return null;
  const t = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  return t.length > max ? null : t || undefined;
}

function words(v: unknown, max: number): Localized | undefined | null {
  if (v == null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const ar = text(o.ar, max);
  const en = text(o.en, max);
  if (ar === null || en === null) return null;
  return localized(ar, en);
}

/** The page's switches from what it sent, or undefined when anything in it is wrong. */
export function parseSwitches(body: Record<string, unknown>, parts: readonly string[]): Switches | undefined {
  const message = words(body.message, MAX_MESSAGE);
  const notice = words(body.notice, MAX_NOTICE);
  if (message === null || notice === null) return undefined;
  if (body.paused != null && typeof body.paused !== 'boolean') return undefined;
  let skip: string[] | undefined;
  if (body.skip != null) {
    if (!Array.isArray(body.skip) || !body.skip.every(p => typeof p === 'string' && parts.includes(p))) return undefined;
    skip = [...new Set(body.skip as string[])];
  }
  let staleMinutes: number | undefined;
  if (body.staleMinutes != null) {
    staleMinutes = stale(body.staleMinutes);
    if (staleMinutes == null) return undefined;
  }
  return {
    paused: body.paused === true || undefined,
    message,
    notice,
    skip: skip?.length ? skip : undefined,
    staleMinutes,
  };
}
