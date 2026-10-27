import { describe, expect, it } from 'vitest';
import { demoResult } from '../../src/adapters/sources/demo/source';
import {
  absenceBudget, academicWeek, alerts, attendanceLevel, clashes, clashingMeetings, courseColors, courseList, courseView,
  meetingsOn, nextMeeting, nowAndNext, termProgress, toIsoDate, weekGrid, withStates,
} from '../../src/core/derive';
import { emptySnapshot, normalizeCourseKey, type Snapshot } from '../../src/core/model';
import { mergeSnapshot } from '../../src/core/snapshot';

// Thursday 22 Oct 2026, 10:15 local time.
const NOW = new Date(2026, 9, 22, 10, 15);
const snap = mergeSnapshot(undefined, demoResult(NOW), 'demo');
const prefs = { absenceLimit: 25 };

describe('schedule', () => {
  it('counts academic weeks from the term start', () => {
    expect(academicWeek({ code: 'x', current: true, start: '2026-10-18' }, NOW)).toBe(1);
    expect(academicWeek({ code: 'x', current: true, start: '2026-10-11' }, NOW)).toBe(2);
    expect(academicWeek({ code: 'x', current: true, start: '2026-10-23' }, NOW)).toBeUndefined();
    expect(academicWeek({ code: 'x', current: true }, NOW)).toBeUndefined();
    // Demo term starts on the Sunday six weeks back.
    expect(academicWeek(snap.terms[0], NOW)).toBe(6);
  });

  it('shows term progress, approximate when the end is unknown', () => {
    expect(termProgress(snap.terms[0], NOW, 16)).toMatchObject({ week: 6, weeks: 16, approximate: false });
    const p = termProgress({ code: 'x', current: true, start: '2026-10-18' }, NOW, 16)!;
    expect(p).toMatchObject({ week: 1, weeks: 16, approximate: true });
    expect(p.pct).toBeCloseTo(5 / 112);
  });

  it('lists a day’s meetings in order and marks now / next / past', () => {
    const thursday = meetingsOn(snap, NOW).map(m => `${m.courseKey}@${m.start}`);
    expect(thursday).toEqual(['PYMT 101@540', 'PYISL 101@660']);
    expect(withStates(meetingsOn(snap, NOW), NOW).map(m => m.state)).toEqual(['past', 'next']);
    const nine30 = new Date(2026, 9, 22, 9, 30);
    expect(withStates(meetingsOn(snap, nine30), nine30).map(m => m.state)).toEqual(['now', 'next']);
  });

  it('shows no classes before the term starts', () => {
    expect(meetingsOn(snap, new Date(2026, 6, 1))).toEqual([]);
  });

  it('finds the next meeting, crossing into following days', () => {
    expect(nextMeeting(snap, NOW)?.meeting.courseKey).toBe('PYISL 101');
    const evening = new Date(2026, 9, 22, 20, 0);
    const next = nextMeeting(snap, evening)!;
    expect(toIsoDate(next.date)).toBe('2026-10-25'); // Friday and Saturday are off
    expect(next.meeting.courseKey).toBe('PYBIO 101');
  });

  it('tells now and next at a glance', () => {
    const during = nowAndNext(snap, new Date(2026, 9, 22, 9, 30));
    expect(during.current.map(m => m.courseKey)).toEqual(['PYMT 101']);
    expect(during.current[0]).toMatchObject({ leftMin: 30, pct: 0.5 });
    expect(during.next).toMatchObject({ today: true, inMin: 90 });
    const evening = nowAndNext(snap, new Date(2026, 9, 22, 20, 0));
    expect(evening).toMatchObject({ dayOver: true, freeDay: false, current: [] });
    expect(evening.next?.today).toBe(false);
    const friday = nowAndNext(snap, new Date(2026, 9, 23, 10, 0));
    expect(friday.freeDay).toBe(true);
  });

  it('lays the week out as a grid, with overlapping classes side by side', () => {
    const g = weekGrid(snap, 0, [5, 6]);
    expect(g.days).toEqual([0, 1, 2, 3, 4]);
    expect([g.from, g.to]).toEqual([8 * 60, 15 * 60]);
    const tuesday = g.blocks.filter(b => b.day === 2).map(b => `${b.courseKey}:${b.lane}/${b.lanes}:${b.clash}`);
    expect(tuesday).toEqual(['PYBIO 101:0/1:false', 'PYSCS 101:0/2:true', 'PYAR 101:1/2:true']);
  });

  it('shows a weekend day only when it has classes', () => {
    const s: Snapshot = { ...snap, sections: [...snap.sections, { courseKey: 'PYAR 101', termCode: '2701', section: 'X', component: 'LEC', meetings: [{ days: [6], start: 600, end: 660 }] }] };
    expect(weekGrid(s, 0, [5, 6]).days).toEqual([0, 1, 2, 3, 4, 6]);
  });
});

describe('clashes', () => {
  it('finds two classes in the same slot, once', () => {
    const list = clashes(snap);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: 'class', day: 2, start: 12 * 60, end: 13 * 60 });
    const pair = list[0]!.kind === 'class' ? [list[0]!.a.courseKey, list[0]!.b.courseKey] : [];
    expect(pair).toEqual(['PYSCS 101', 'PYAR 101']);
    expect(clashingMeetings(list).size).toBe(2);
  });

  it('a class listed twice is not a clash with itself; exams at the same time are', () => {
    const s: Snapshot = {
      ...emptySnapshot('demo'),
      terms: [{ code: 'T', current: true }],
      sections: [
        { courseKey: 'A 1', termCode: 'T', section: 'S', component: 'LEC', meetings: [{ days: [0], start: 480, end: 540 }, { days: [0], start: 480, end: 540 }] },
      ],
      exams: [
        { courseKey: 'A 1', termCode: 'T', date: '2026-12-01', start: 540, end: 660 },
        { courseKey: 'B 1', termCode: 'T', date: '2026-12-01', start: 600, end: 720 },
        { courseKey: 'C 1', termCode: 'T', date: '2026-12-01' },
      ],
    };
    expect(clashes(s).map(c => c.kind)).toEqual(['exam']);
  });
});

describe('attendance', () => {
  it('grades absence against the limit', () => {
    expect(attendanceLevel(0, 25)).toBe('ok');
    expect(attendanceLevel(12.5, 25)).toBe('warn');
    expect(attendanceLevel(20, 25)).toBe('risk');
  });

  it('estimates the days of the course left before the limit, cautiously when the term end is unknown', () => {
    // Human Biology: lecture Sun+Tue (1.5 h, counted 2) and lab Mon (2 h) = 3 days
    // and 6 hours a week. No term end, so 16 - 3 quiet weeks = 13 weeks = 39 days,
    // and 48 at the usual length.
    const noEnd = { ...snap, terms: snap.terms.map(t => ({ ...t, end: undefined })) };
    const b = absenceBudget(noEnd, 'PYBIO 101', 12, 25, 16)!;
    expect(b).toEqual({
      perWeek: 3, hoursPerWeek: 6, weeks: 13, total: 39, allowed: 9, used: 5, left: 4, hoursLeft: 10,
      endKnown: false, leftAtMost: 6, hoursLeftAtMost: 12,
    });
    expect(absenceBudget(snap, 'NOPE 000', 0, 25, 16)).toBeUndefined();
  });

  it('counts the real term when its dates are known', () => {
    const b = absenceBudget(snap, 'PYBIO 101', 21, 25, 16)!;
    expect(b).toMatchObject({ weeks: 16, total: 48, allowed: 12, used: 10, left: 2, hoursLeft: 4, endKnown: true });
    expect(b.leftAtMost).toBeUndefined();
  });

  it('counts a day of hour-long classes as one day, not one class an hour', () => {
    // Four one-hour classes, Sunday to Wednesday: 4 days and 16 hours a week.
    const hour = (start: number) => ({ days: [0, 1, 2, 3], start, end: start + 60 });
    const s: Snapshot = { ...snap, sections: [...snap.sections, { courseKey: 'PYENG 101', termCode: '2701', section: 'X', component: 'LEC', meetings: [hour(960), hour(1020), hour(1080), hour(1140)] }] };
    const b = absenceBudget(s, 'PYENG 101', 3, 25, 16)!;
    expect(b).toMatchObject({ perWeek: 4, hoursPerWeek: 16, total: 64, allowed: 16, used: 2, left: 14, hoursLeft: 56 });
  });
});

describe('courses', () => {
  it('raises alerts: absence risk, the clash, close exams, absence warnings, to-dos', () => {
    const kinds = alerts(snap, prefs, NOW).map(a => a.kind === 'attendance' ? `${a.kind}:${a.record.courseKey}:${a.level}` : a.kind);
    expect(kinds).toEqual(['attendance:PYBIO 101:risk', 'clash', 'exam', 'attendance:PYMT 101:warn', 'todo']);
  });

  it('builds course rows, most absences first, and a single-course view', () => {
    const rows = courseList(snap, prefs);
    expect(rows.map(r => r.course.key).slice(0, 3)).toEqual(['PYBIO 101', 'PYMT 101', 'PYPHY 101']);
    expect(rows).toHaveLength(6);
    const bio = courseView(snap, 'PYBIO 101', prefs)!;
    expect(bio.sections.map(s => s.component)).toEqual(['LEC', 'LAB']);
    expect(bio.components).toEqual(['LEC', 'LAB']);
    expect(bio.level).toBe('risk');
    expect(bio.exam?.room).toBe('Hall 1');
    expect(courseView(snap, 'NOPE 000', prefs)).toBeUndefined();
  });

  it('gives every course its own color', () => {
    const colors = courseColors(snap, 10);
    expect(new Set(colors.values()).size).toBe(snap.courses.length);
    expect(courseColors(snap, 10)).toEqual(colors);
  });

  it('knows a course by its whole code', () => {
    expect(normalizeCourseKey('PYBIO 101')).toBe('PYBIO 101');
    expect(normalizeCourseKey(' pybio  101 ')).toBe('PYBIO 101');
    expect(normalizeCourseKey('PYBIO101')).toBe('PYBIO 101');
    expect(normalizeCourseKey('PYBIO 101-PBAB')).toBe('PYBIO 101');
    expect(normalizeCourseKey('PYBIO 101 (3456)')).toBe('PYBIO 101');
    // The bug in Docs/خطة النسخة 1 (ب1): the part before "-" merged these.
    expect(normalizeCourseKey('MED-101')).toBe('MED 101');
    expect(normalizeCourseKey('MED-102')).toBe('MED 102');
    expect(normalizeCourseKey('PYBIO 101L')).toBe('PYBIO 101L');
    expect(normalizeCourseKey('Anatomy - Lab')).toBe('Anatomy - Lab');
  });
});
