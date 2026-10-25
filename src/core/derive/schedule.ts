// The week as the student lives it: what is on a given day, what is on now,
// what comes next, and the week laid out as a grid.
import type { Course, Snapshot, Term } from '../model';
import { addDays, daysBetween, fromIsoDate, minutesOfDay, toIsoDate } from './time';

export function currentTerm(s: Snapshot): Term | undefined {
  return s.terms.find(t => t.current) ?? s.terms[s.terms.length - 1];
}

/** Week number since the term started (week 1 = first week), or undefined if unknown. */
export function academicWeek(term: Term | undefined, now: Date): number | undefined {
  if (!term?.start) return undefined;
  const days = daysBetween(fromIsoDate(term.start), now);
  return days < 0 ? undefined : Math.floor(days / 7) + 1;
}

export interface TermProgress {
  week: number;
  weeks: number;
  /** 0–1 */
  pct: number;
  /** The end is not known from the source; `weeks` is the institution's usual length. */
  approximate: boolean;
}

export function termProgress(term: Term | undefined, now: Date, usualWeeks: number): TermProgress | undefined {
  const week = academicWeek(term, now);
  if (!term?.start || week == null) return undefined;
  const known = term.end ? Math.ceil((daysBetween(fromIsoDate(term.start), fromIsoDate(term.end)) + 1) / 7) : undefined;
  const weeks = Math.max(known ?? usualWeeks, 1);
  const elapsed = daysBetween(fromIsoDate(term.start), now) + 1;
  return { week: Math.min(week, weeks), weeks, pct: Math.min(1, Math.max(0, elapsed / (weeks * 7))), approximate: known == null };
}

export interface MeetingView {
  /** Unique within a day. */
  id: string;
  courseKey: string;
  title?: string;
  termCode: string;
  section: string;
  component: string;
  start: number;
  end: number;
  room?: string;
}

export type MeetingState = 'past' | 'now' | 'next' | 'later';

const courseIndex = (s: Snapshot): Map<string, Course> => new Map(s.courses.map(c => [c.key, c]));

/** Classes do not happen before the term starts, or after it ends when the end is known. */
export function inTerm(s: Snapshot, date: Date): boolean {
  const term = currentTerm(s);
  const iso = toIsoDate(date);
  return !(term?.start && iso < term.start) && !(term?.end && iso > term.end);
}

/** Meetings on a weekday (0 = Sunday) in the current term, by start time, duplicates removed. */
export function meetingsOnDay(s: Snapshot, day: number): MeetingView[] {
  const term = currentTerm(s)?.code;
  const courses = courseIndex(s);
  const seen = new Set<string>();
  const out: MeetingView[] = [];
  for (const sec of s.sections) {
    if (term && sec.termCode !== term) continue;
    for (const m of sec.meetings) {
      if (!m.days.includes(day)) continue;
      const id = `${sec.courseKey}|${sec.section}|${sec.component}|${m.start}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id, courseKey: sec.courseKey, title: courses.get(sec.courseKey)?.title, termCode: sec.termCode,
        section: sec.section, component: sec.component, start: m.start, end: m.end, room: m.room,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end || a.courseKey.localeCompare(b.courseKey));
}

/** Meetings on a date: the weekday's meetings, when the date is inside the term. */
export function meetingsOn(s: Snapshot, date: Date): MeetingView[] {
  return inTerm(s, date) ? meetingsOnDay(s, date.getDay()) : [];
}

/** A day's meetings with their state relative to now. */
export function withStates<M extends MeetingView>(list: M[], now: Date): (M & { state: MeetingState })[] {
  const t = minutesOfDay(now);
  const next = list.find(m => m.start > t)?.start;
  return list.map(m => ({
    ...m,
    state: m.end <= t ? 'past' : m.start <= t ? 'now' : m.start === next ? 'next' : 'later',
  }));
}

/** The next meeting that has not started yet, looking up to `horizonDays` ahead. */
export function nextMeeting(s: Snapshot, now: Date, horizonDays = 7): { meeting: MeetingView; date: Date } | undefined {
  for (let k = 0; k <= horizonDays; k++) {
    const date = addDays(now, k);
    const list = meetingsOn(s, date).filter(m => k > 0 || m.start > minutesOfDay(now));
    if (list.length) return { meeting: list[0]!, date };
  }
  return undefined;
}

export interface NowAndNext {
  /** Meetings in progress (more than one means a clash). */
  current: (MeetingView & { leftMin: number; pct: number })[];
  next?: { meeting: MeetingView; date: Date; inMin: number; today: boolean };
  /** There were classes today and all of them are over. */
  dayOver: boolean;
  /** No classes at all today. */
  freeDay: boolean;
}

/** What the student needs at a glance: the class now, and the one after (Docs/21: 超级课程表). */
export function nowAndNext(s: Snapshot, now: Date): NowAndNext {
  const t = minutesOfDay(now);
  const today = meetingsOn(s, now);
  const current = today
    .filter(m => m.start <= t && t < m.end)
    .map(m => ({ ...m, leftMin: m.end - t, pct: (t - m.start) / Math.max(1, m.end - m.start) }));
  const n = nextMeeting(s, now);
  const next = n && {
    ...n,
    today: toIsoDate(n.date) === toIsoDate(now),
    inMin: daysBetween(now, n.date) * 24 * 60 + n.meeting.start - t,
  };
  return { current, next, dayOver: today.length > 0 && today.every(m => m.end <= t), freeDay: today.length === 0 };
}

export interface GridBlock extends MeetingView {
  day: number;
  /** Side-by-side position when meetings overlap: lane of lanes. */
  lane: number;
  lanes: number;
  clash: boolean;
}

export interface WeekGrid {
  days: number[];
  /** Minutes, rounded to whole hours. */
  from: number;
  to: number;
  blocks: GridBlock[];
}

/**
 * The week as a days × hours grid (Docs/21: NUSMods). Weekend days appear only
 * when they have classes. Overlapping meetings share their slot side by side,
 * and are marked as a clash.
 */
export function weekGrid(s: Snapshot, weekStart = 0, weekend: readonly number[] = [5, 6]): WeekGrid {
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const perDay = new Map(order.map(d => [d, meetingsOnDay(s, d)]));
  const days = order.filter(d => !weekend.includes(d) || perDay.get(d)!.length > 0);
  const blocks: GridBlock[] = [];
  for (const day of days) {
    const list = perDay.get(day)!;
    // Group meetings that overlap, then give each a lane inside its group.
    let group: GridBlock[] = [];
    let groupEnd = -1;
    const close = () => { for (const b of group) { b.lanes = Math.max(...group.map(g => g.lane)) + 1; b.clash = group.length > 1 && overlapsAny(b, group); } };
    for (const m of list) {
      if (m.start >= groupEnd) { close(); group = []; }
      const taken = new Set(group.filter(g => g.end > m.start).map(g => g.lane));
      let lane = 0;
      while (taken.has(lane)) lane++;
      const b: GridBlock = { ...m, day, lane, lanes: 1, clash: false };
      group.push(b);
      blocks.push(b);
      groupEnd = Math.max(groupEnd, m.end);
    }
    close();
  }
  const starts = blocks.map(b => b.start);
  const ends = blocks.map(b => b.end);
  const from = starts.length ? Math.floor(Math.min(...starts) / 60) * 60 : 8 * 60;
  const to = ends.length ? Math.ceil(Math.max(...ends) / 60) * 60 : 16 * 60;
  return { days, from, to: Math.max(to, from + 60), blocks };
}

const overlapsAny = (b: GridBlock, group: GridBlock[]) => group.some(g => g !== b && g.start < b.end && b.start < g.end);
