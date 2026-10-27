// The owner's page talking to Raad (raad/server/admin.ts). The key is kept on
// this device only when the owner asks; otherwise for this tab alone.
import type { Cooldown } from '../../raad/server/guard';
import type { StatsReport } from '../../raad/server/stats';
import type { Switches } from '../../raad/server/switches';
import type { Wish } from '../../raad/server/wishes';

export interface AdminState {
  /** The page's switches, and the same switches set as Worker variables in the dashboard. */
  page: Switches;
  dashboard: Switches;
  rest: Cooldown | null;
  parts: string[];
  version: string;
  build?: string;
  stats: boolean;
}

export class AdminError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

const KEY = 'taleeb-admin-key';

export function savedKey(): string | null {
  try {
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function keepKey(key: string, remember: boolean) {
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, key);
  } catch { /* the key stays in memory for this visit */ }
}

export function dropKey() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch { /* nothing kept */ }
}

async function call<T>(key: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/admin/${path}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${key}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AdminError('OFFLINE', 0);
  }
  const body = await res.json().catch(() => ({})) as { code?: string };
  if (!res.ok) throw new AdminError(body.code ?? 'SERVER_ERROR', res.status);
  return body as T;
}

export const adminApi = (key: string) => ({
  state: () => call<AdminState>(key, 'state'),
  stats: () => call<StatsReport>(key, 'stats'),
  save: (page: Switches) => call<{ page: Switches }>(key, 'switches', { method: 'PUT', body: page }),
  endRest: () => call<{ rest: null }>(key, 'rest', { method: 'DELETE' }),
  wishes: () => call<{ wishes: Wish[] }>(key, 'wishes').then(r => r.wishes),
  removeWish: (wishKey: string) => call<object>(key, 'wishes', { method: 'DELETE', body: { key: wishKey } }),
});

/** Can Raad reach the college? The students' own question (GET /api/v1/health), answered once a minute at most. */
export async function collegeHealth(): Promise<{ sis?: number; reachable?: boolean } | undefined> {
  try {
    const res = await fetch('/api/v1/health', { cache: 'no-store' });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

/** A student asked to be forgotten: the same call the app makes at sign-out. */
export async function forgetStudent(userid: string): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userid }) });
    return res.status === 204;
  } catch {
    return false;
  }
}
