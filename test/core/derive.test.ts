import { describe, expect, it } from 'vitest';
import { demoResult } from '../../src/adapters/demo/source';
import { academicWeek, alerts, attendanceLevel, avatarFor, courseList, courseView, meetingsOn, nextMeeting, toIsoDate, withStates } from '../../src/core/derive';
import { mergeSnapshot } from '../../src/core/snapshot';

// Thursday 22 Oct 2026, 10:15 local time.
const NOW = new Date(2026, 9, 22, 10, 15);
const snap = mergeSnapshot(undefined, demoResult(NOW), 'demo');
const prefs = { absenceLimit: 25 };

describe('derive', () => {
  it('counts academic weeks from the term start', () => {
    expect(academicWeek({ code: 'x', current: true, start: '2026-10-18' }, NOW)).toBe(1);
    expect(academicWeek({ code: 'x', current: true, start: '2026-10-11' }, NOW)).toBe(2);
    expect(academicWeek({ code: 'x', current: true, start: '2026-10-23' }, NOW)).toBeUndefined();
    expect(academicWeek({ code: 'x', current: true }, NOW)).toBeUndefined();
    // Demo term starts on the Sunday six weeks back.
    expect(academicWeek(snap.terms[0], NOW)).toBe(6);
  });

  it('lists a day’s meetings in order and marks now / next / past', () => {
    const thursday = meetingsOn(snap, NOW).map(m => `${m.courseKey}@${m.start}`);
    expect(thursday).toEqual(['PYMT 101@540', 'PYISL 101@660']);
    expect(withStates(meetingsOn(snap, NOW), NOW).map(m => m.state)).toEqual(['past', 'next']);
    const nine30 = new Date(2026, 9, 22, 9, 30);
    expect(withStates(meetingsOn(snap, nine30), nine30).map(m => m.state)).toEqual(['now', 'next']);
  });

  it('finds the next meeting, crossing into following days', () => {
    expect(nextMeeting(snap, NOW)?.meeting.courseKey).toBe('PYISL 101');
    const evening = new Date(2026, 9, 22, 20, 0);
    const next = nextMeeting(snap, evening)!;
    expect(toIsoDate(next.date)).toBe('2026-10-25'); // Friday and Saturday are off
    expect(next.meeting.courseKey).toBe('PYBIO 101');
  });

  it('grades absence against the limit', () => {
    expect(attendanceLevel(0, 25)).toBe('ok');
    expect(attendanceLevel(12.5, 25)).toBe('warn');
    expect(attendanceLevel(20, 25)).toBe('risk');
  });

  it('raises alerts for risky attendance, close exams and to-dos', () => {
    const kinds = alerts(snap, prefs, NOW).map(a => a.kind === 'attendance' ? `${a.kind}:${a.record.courseKey}:${a.level}` : a.kind);
    expect(kinds).toEqual(['attendance:PYBIO 101:risk', 'exam', 'attendance:PYMT 101:warn', 'todo']);
  });

  it('builds course rows, most absences first, and a single-course view', () => {
    const rows = courseList(snap, prefs);
    expect(rows.map(r => r.course.key).slice(0, 3)).toEqual(['PYBIO 101', 'PYMT 101', 'PYPHY 101']);
    expect(rows).toHaveLength(6);
    const bio = courseView(snap, 'PYBIO 101', prefs)!;
    expect(bio.sections.map(s => s.component)).toEqual(['LEC', 'LAB']);
    expect(bio.level).toBe('risk');
    expect(bio.exam?.room).toBe('Hall 1');
    expect(courseView(snap, 'NOPE 000', prefs)).toBeUndefined();
  });

  it('picks the same avatar for the same student, spread across students', () => {
    const list = ['a.svg', 'b.svg', 'c.svg'];
    expect(avatarFor('2000123', list)).toBe(avatarFor('2000123', list));
    const picks = new Set(Array.from({ length: 30 }, (_, i) => avatarFor(String(2000000 + i), list)));
    expect(picks.size).toBe(3);
    expect(avatarFor('1', [])).toBeUndefined();
  });
});
