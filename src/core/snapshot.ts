// Merging sync results into the stored snapshot. An area that synced replaces
// its fields completely; an area that failed keeps its old data and is marked
// stale, so a partial failure never erases anything. An area that comes back
// empty when it had rows this term is doubted, not believed (see `doubtful`).
// A term the source moved on from goes to the archive, and what changed is remembered.
import { diffSnapshots, keepChanges } from './derive/changes';
import { currentTerm } from './derive/schedule';
import {
  AREA_FIELDS, DATA_AREAS, SCHEMA_VERSION, emptySnapshot,
  type Course, type ExtraBlock, type DataArea, type Snapshot, type SourceId, type Student, type SyncResult, type Term, type TermRecord,
} from './model';

/** Terms kept in the archive. */
const ARCHIVE_MAX = 16;

export function mergeSnapshot(prev: Snapshot | undefined, result: SyncResult, source: SourceId): Snapshot {
  const base = prev && prev.source === source ? migrateSnapshot(prev) ?? emptySnapshot(source) : emptySnapshot(source);
  const next: Snapshot = { ...base, provenance: { ...base.provenance } };

  for (const key of DATA_AREAS) {
    let p = result.provenance[key];
    if (!p) continue;
    if (p.status === 'fresh' && doubtful(base, result, key)) p = { status: 'error', error: 'PARSE' };
    if (p.status === 'fresh') {
      if (key === 'extras') next.extras = mergeExtras(base.extras, result.data.extras ?? [], result.fetchedAt);
      else if (key === 'student') next.student = mergeStudent(base.student, result.data.student);
      else for (const field of AREA_FIELDS[key]) assignField(next, result.data, field);
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

  const before = currentTerm(base);
  const after = currentTerm(next);
  if (before && after && before.code !== after.code) {
    if (hasTermData(base, before.code)) {
      next.archive = [archiveTerm(base, before, result.fetchedAt), ...base.archive.filter(r => r.term.code !== before.code)].slice(0, ARCHIVE_MAX);
    }
  } else if (prev) {
    next.changes = keepChanges(diffSnapshots(base, next, result.fetchedAt), base.changes, result.fetchedAt);
  }
  return next;
}

/** Areas whose rows do not all vanish within a term: an empty answer for them is doubted. */
const DOUBT_EMPTY: Partial<Record<DataArea, 'sections' | 'attendance' | 'grades'>> = { schedule: 'sections', attendance: 'attendance', grades: 'grades' };

/**
 * A schedule, attendance or grades that were full this term and come back
 * empty more likely mean a page the source changed than a term with no
 * classes. Believing it would tell the student every class was removed, so
 * the old rows stay, marked stale, until the area comes back with rows or the
 * term changes.
 */
function doubtful(base: Snapshot, result: SyncResult, key: DataArea): boolean {
  const field = DOUBT_EMPTY[key];
  if (!field || result.data[field]?.length) return false;
  const had: { termCode: string }[] = base[field];
  if (!had.length) return false;
  const term = result.data.terms?.find(t => t.current)?.code;
  return !term || had.some(r => r.termCode === term);
}

/** A snapshot saved by an older version, brought up to this one; undefined if unknown. */
export function migrateSnapshot(s: unknown): Snapshot | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const v = (s as { schemaVersion?: unknown }).schemaVersion;
  if (v === SCHEMA_VERSION) return s as Snapshot;
  if (v === 1) {
    const old = s as Omit<Snapshot, 'schemaVersion' | 'archive' | 'changes'>;
    return { ...old, schemaVersion: SCHEMA_VERSION, archive: [], changes: [] };
  }
  return undefined;
}

const hasTermData = (s: Snapshot, code: string) =>
  [s.sections, s.attendance, s.grades, s.exams].some(list => list.some(x => x.termCode === code));

/** Everything about one term, as it stood before the source moved on. */
export function archiveTerm(s: Snapshot, term: Term, at: string): TermRecord {
  const of = <T extends { termCode: string }>(xs: T[]) => xs.filter(x => x.termCode === term.code);
  const sections = of(s.sections);
  const keys = new Set([...sections, ...of(s.grades), ...of(s.attendance)].map(x => x.courseKey));
  return {
    term: { ...term, current: false },
    courses: s.courses.filter(c => keys.has(c.key)),
    sections,
    attendance: of(s.attendance),
    grades: of(s.grades),
    termStats: of(s.termStats),
    exams: of(s.exams),
    archivedAt: at,
  };
}

// A fresh area with no rows is an empty list, not "unknown".
function assignField<K extends keyof Snapshot>(to: Snapshot, from: SyncResult['data'], k: K) {
  to[k] = ((from as Partial<Snapshot>)[k] ?? (k === 'student' ? undefined : [])) as Snapshot[K];
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
    return merged.map(t => ({ ...t, current: current.has(t.code) }));
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

/** The newest time any area was fetched. */
export function lastFetched(s: Snapshot | undefined): string | undefined {
  return Object.values(s?.provenance ?? {}).map(p => p?.fetchedAt).filter((x): x is string => !!x).sort().pop();
}
