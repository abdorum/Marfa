import { describe, expect, it } from 'vitest';
import { demoResult } from '../../src/adapters/sources/demo/source';
import { toIcs } from '../../src/core/ics';
import { mergeSnapshot } from '../../src/core/snapshot';

const NOW = new Date(2026, 9, 22, 10, 15);
const snap = mergeSnapshot(undefined, demoResult(NOW), 'demo');
const ics = toIcs(snap, {
  now: NOW,
  tz: { id: 'Asia/Riyadh', offsetMinutes: 180 },
  termWeeks: 16,
  calendarName: 'جدولي',
  words: { exam: 'اختبار', components: { LEC: 'نظري', LAB: 'عملي' } },
});
const lines = ics.split('\r\n');

describe('toIcs', () => {
  it('is a well-formed calendar with CRLF lines no longer than 75 bytes', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(ics.match(/END:VEVENT/g)!.length);
  });

  it('repeats each class weekly from the term start to its end, with a reminder', () => {
    // Human Biology lecture: Sundays and Tuesdays 8:00–9:30; term starts Sunday 13 Sep 2026.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DTSTART;TZID=Asia/Riyadh:20260913T080000');
    expect(unfolded).toContain('DTSTART;TZID=Asia/Riyadh:20260915T080000');
    expect(unfolded).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20270102T205959Z');
    expect(unfolded).toContain('SUMMARY:Human Biology · نظري');
    expect(unfolded).toContain('TRIGGER:-PT15M');
    // One event per class day: 2 + 1 + 2 + 2 + 1 + 1 + 1.
    expect(unfolded.match(/RRULE:/g)).toHaveLength(10);
  });

  it('adds exams with a reminder the day before', () => {
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:اختبار: Medical Terminology');
    expect(unfolded).toContain('DTSTART;TZID=Asia/Riyadh:20261027T090000');
    expect(unfolded).toContain('TRIGGER:-P1D');
  });

  it('escapes text', () => {
    const s = { ...snap, courses: snap.courses.map(c => (c.key === 'PYSCS 101' ? { ...c, title: 'Study, Skills; & more' } : c)) };
    const out = toIcs(s, { now: NOW, tz: { id: 'Asia/Riyadh', offsetMinutes: 180 }, termWeeks: 16, calendarName: 'x', words: { exam: 'e', components: {} } });
    expect(out.replace(/\r\n /g, '')).toContain(String.raw`SUMMARY:Study\, Skills\; & more · LEC`);
  });
});
