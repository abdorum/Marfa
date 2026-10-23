// Merging sync results into the stored snapshot. A section that synced
// replaces its fields completely; a section that failed keeps its old data
// and is marked stale, so a partial failure never erases anything.
import {
  SECTION_FIELDS, SECTION_KEYS, SCHEMA_VERSION, emptySnapshot,
  type Course, type ExtraBlock, type SectionKey, type Snapshot, type SourceId, type Student, type SyncResult, type Term,
} from './model';

export function mergeSnapshot(prev: Snapshot | undefined, result: SyncResult, source: SourceId): Snapshot {
  const base = prev && prev.schemaVersion === SCHEMA_VERSION && prev.source === source ? prev : emptySnapshot(source);
  const next: Snapshot = { ...base, provenance: { ...base.provenance } };

  for (const key of SECTION_KEYS) {
    const p = result.provenance[key];
    if (!p) continue;
    if (p.status === 'fresh') {
      if (key === 'extras') next.extras = mergeExtras(base.extras, result.data.extras ?? [], result.fetchedAt);
      else if (key === 'student') next.student = mergeStudent(base.student, result.data.student);
      else for (const field of SECTION_FIELDS[key]) assignField(next, result.data, field);
      next.provenance[key] = p;
    } else {
      // Keep what we had; remember the failure.
      const had = base.provenance[key];
      next.provenance[key] = had?.fetchedAt
        ? { status: 'stale', fetchedAt: had.fetchedAt, error: p.error }
        : { status: p.status, error: p.error };
    }
  }

  next.courses = upsert(base.courses, result.data.courses ?? [], c => c.key, mergeCourse);
  next.terms = mergeTerms(base.terms, result.data.terms ?? []);
  return next;
}

// A fresh section with no rows is an empty list, not "unknown".
function assignField<K extends keyof Snapshot>(to: Snapshot, from: Partial<Snapshot>, k: K) {
  to[k] = (from[k] ?? (k === 'student' ? undefined : [])) as Snapshot[K];
}

function upsert<T>(old: T[], incoming: T[], key: (t: T) => string, combine: (a: T, b: T) => T): T[] {
  const map = new Map(old.map(t => [key(t), t]));
  for (const t of incoming) {
    const k = key(t);
    const had = map.get(k);
    map.set(k, had ? combine(had, t) : t);
  }
  return [...map.values()];
}

// Later values win, but never overwrite a known value with nothing.
const mergeCourse = (a: Course, b: Course): Course => ({ ...a, ...stripUndefined(b) });

// The student record is assembled from several pages, so it merges field by
// field: a page that failed must not erase the name another page provided.
function mergeStudent(a: Student | undefined, b: Student | undefined): Student | undefined {
  if (!a || !b || a.id !== b.id) return b ?? a;
  return {
    ...a, ...stripUndefined(b),
    name: { ...a.name, ...stripUndefined(b.name) },
    firstName: { ...a.firstName, ...stripUndefined(b.firstName) },
  };
}

function mergeTerms(old: Term[], incoming: Term[]): Term[] {
  const merged = upsert(old, incoming, t => t.code, (a, b) => ({ ...a, ...stripUndefined(b) }));
  if (incoming.some(t => t.current)) {
    const current = new Set(incoming.filter(t => t.current).map(t => t.code));
    for (const t of merged) t.current = current.has(t.code);
  }
  return merged;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Blocks seen now are refreshed; a block missing from two successful syncs in a row disappears. */
export function mergeExtras(old: ExtraBlock[], seen: ExtraBlock[], at: string): ExtraBlock[] {
  const seenIds = new Set(seen.map(b => b.id));
  const prev = new Map(old.map(b => [b.id, b]));
  const out: ExtraBlock[] = seen.map(b => ({ ...b, firstSeen: prev.get(b.id)?.firstSeen ?? at, lastSeen: at, missed: 0 }));
  for (const b of old) {
    if (seenIds.has(b.id)) continue;
    const missed = (b.missed ?? 0) + 1;
    if (missed < 2) out.push({ ...b, missed });
  }
  return out;
}

export function sectionStatus(s: Snapshot | undefined, key: SectionKey) {
  return s?.provenance[key] ?? { status: 'missing' as const };
}
