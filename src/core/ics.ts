// The schedule and exams as an iCalendar file (RFC 5545), so the phone's own
// calendar reminds the student before each class and exam: real notifications
// without a server (Docs/21: NUSMods). Pure: a snapshot in, text out.
import { componentOrder } from './components';
import { currentTerm } from './derive/schedule';
import { addDays, fromIsoDate, toIsoDate } from './derive/time';
import type { Snapshot } from './model';

export interface IcsOptions {
  now: Date;
  /** The institution's time zone; classes are wall-clock times there. */
  tz: { id: string; offsetMinutes: number };
  /** Used when the source gives no term end. */
  termWeeks: number;
  calendarName: string;
  /** Short words for components and the exam, in the student's language. */
  words: { exam: string; components: Record<string, string> };
  classAlarmMin?: number;
  examAlarmMin?: number;
  product?: string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** "2026-10-25" + 540 → "20261025T090000" */
const local = (iso: string, minutes: number) => `${iso.replace(/-/g, '')}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;

/** Text values escape backslash, comma, semicolon and newlines. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded, never inside a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; size = 0; }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function toIcs(s: Snapshot, o: IcsOptions): string {
  const term = currentTerm(s);
  const stamp = o.now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const product = o.product ?? 'Taleeb Portal';
  const title = (key: string) => s.courses.find(c => c.key === key)?.title ?? key;
  const off = o.tz.offsetMinutes;
  const offText = `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`;

  // Weekly classes run from the term start (or this week) to its end (or the usual length).
  const today = toIsoDate(o.now);
  const from = term?.start && term.start <= today ? fromIsoDate(term.start) : addDays(o.now, -o.now.getDay());
  const until = term?.end ? fromIsoDate(term.end) : addDays(from, o.termWeeks * 7 - 1);
  // UNTIL is in UTC when DTSTART has a time zone: the last minute of the last day, local.
  const untilUtc = new Date(Date.UTC(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59) - off * 60000)
    .toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${product}//AR`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(o.calendarName)}`, `X-WR-TIMEZONE:${o.tz.id}`,
    'BEGIN:VTIMEZONE', `TZID:${o.tz.id}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offText}`, `TZOFFSETTO:${offText}`, 'END:STANDARD', 'END:VTIMEZONE',
  ];
  const alarm = (minutes: number, text: string) => [
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`,
    `TRIGGER:-P${minutes >= 1440 && minutes % 1440 === 0 ? `${minutes / 1440}D` : `T${minutes}M`}`, 'END:VALARM',
  ];

  const sections = s.sections.filter(x => !term || x.termCode === term.code)
    .sort((a, b) => a.courseKey.localeCompare(b.courseKey) || componentOrder(a.component, b.component));
  for (const sec of sections) {
    for (const m of sec.meetings) {
      for (const d of m.days) {
        const first = addDays(from, (d - from.getDay() + 7) % 7);
        const date = toIsoDate(first);
        const name = `${title(sec.courseKey)} · ${o.words.components[sec.component] ?? sec.component}`;
        lines.push(
          'BEGIN:VEVENT',
          `UID:${[term?.code ?? 'term', sec.courseKey, sec.component, sec.section, d, m.start].join('-').replace(/\s+/g, '')}@taleeb-portal`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=${o.tz.id}:${local(date, m.start)}`,
          `DTEND;TZID=${o.tz.id}:${local(date, m.end)}`,
          `RRULE:FREQ=WEEKLY;BYDAY=${DAYS[d]};UNTIL=${untilUtc}`,
          `SUMMARY:${esc(name)}`,
          ...(m.room ? [`LOCATION:${esc(m.room)}`] : []),
          `DESCRIPTION:${esc(`${sec.courseKey} · ${sec.section}`)}`,
          ...alarm(o.classAlarmMin ?? 15, name),
          'END:VEVENT',
        );
      }
    }
  }

  for (const e of s.exams.filter(x => !term || x.termCode === term.code)) {
    const name = `${o.words.exam}: ${title(e.courseKey)}`;
    const timed = e.start != null && e.end != null && e.end > e.start;
    lines.push(
      'BEGIN:VEVENT',
      `UID:exam-${e.termCode}-${e.courseKey.replace(/\s+/g, '')}@taleeb-portal`,
      `DTSTAMP:${stamp}`,
      ...(timed
        ? [`DTSTART;TZID=${o.tz.id}:${local(e.date, e.start!)}`, `DTEND;TZID=${o.tz.id}:${local(e.date, e.end!)}`]
        : [`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${toIsoDate(addDays(fromIsoDate(e.date), 1)).replace(/-/g, '')}`]),
      `SUMMARY:${esc(name)}`,
      ...(e.room ? [`LOCATION:${esc(e.room)}`] : []),
      `DESCRIPTION:${esc(e.courseKey)}`,
      ...alarm(o.examAlarmMin ?? 1440, name),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
