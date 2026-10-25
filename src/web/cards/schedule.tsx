// The schedule's cards: the week as a grid (Docs/21: NUSMods, 時間割), a
// day, a month, and the export to the phone's calendar.
import { useState } from 'preact/hooks';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-preact';
import { PRODUCT } from '../../app/product';
import {
  addDays, clashes, clashingMeetings, currentTerm, fromIsoDate, meetingsOn, minutesOfDay, toIsoDate, weekGrid, withStates,
  type MeetingState, type MeetingView,
} from '../../core/derive';
import { toIcs } from '../../core/ics';
import { courseSlug } from '../../core/model';
import { INSTITUTION } from '../../institutions';
import { clock, dateLabel, dayName, monthLabel, strings, timeRange } from '../i18n';
import { useTick } from '../raad/RaadLine';
import { courseColor, snapshot } from '../state';
import { componentLabel, Empty, Link, toast } from '../ui';
import { Card } from './Card';
import { ClassRow, courseTitle } from './common';

export function WeekCard({ index }: { index?: number }) {
  const s = snapshot.value!;
  useTick(60_000);
  const g = weekGrid(s, INSTITUTION.weekStart, INSTITUTION.weekend);
  const hours = (g.to - g.from) / 60;
  const now = new Date();
  const today = now.getDay();
  const t = minutesOfDay(now);
  if (!g.blocks.length) return <Card id="week" title={strings.value.schedule.views.week} index={index}><Empty>{strings.value.schedule.empty}</Empty></Card>;
  return (
    <Card id="week" title={strings.value.schedule.views.week} index={index}>
      <div class="wk-wrap">
        <div class="wk" style={{ '--days': g.days.length, '--hours': hours, '--from': g.from }}>
          <span />
          {g.days.map(d => <div class={`wk-day${d === today ? ' today' : ''}`}><span>{dayName(d, 'short')}</span></div>)}
          <div class="wk-hours" aria-hidden="true">
            {Array.from({ length: hours + 1 }, (_, i) => <span style={{ insetBlockStart: `calc(${i} * var(--hour))` }}>{clock(g.from + i * 60)}</span>)}
          </div>
          {g.days.map(d => (
            <div class={`wk-col${d === today ? ' today' : ''}`} aria-label={dayName(d)}>
              {g.blocks.filter(b => b.day === d).map(b => (
                <div class={`wk-block${b.clash ? ' clash' : ''}`} style={{ '--s': b.start, '--e': b.end, '--lane': b.lane, '--lanes': b.lanes, '--c': courseColor(b.courseKey) }}>
                  <Link href={`/courses/${courseSlug(b.courseKey)}`} aria-label={`${b.title ?? b.courseKey}، ${componentLabel(b.component)}، ${timeRange(b.start, b.end)}`}>
                    <b>{b.title ?? b.courseKey}</b>
                    <small>{clock(b.start)}</small>
                    {b.room && <small>{b.room}</small>}
                  </Link>
                </div>
              ))}
              {d === today && t >= g.from && t <= g.to && <i class="wk-now" style={{ '--t': t }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** One day's classes and exams. */
export function DayList({ date }: { date: Date }) {
  const s = snapshot.value!;
  const iso = toIsoDate(date);
  const now = new Date();
  const isToday = iso === toIsoDate(now);
  const classes = meetingsOn(s, date);
  const list: (MeetingView & { state?: MeetingState })[] = isToday ? withStates(classes, now) : classes;
  const clash = clashingMeetings(clashes(s));
  const exams = s.exams.filter(e => e.date === iso);
  if (!classes.length && !exams.length) return <Empty>{strings.value.schedule.empty}</Empty>;
  return (
    <div class="list">
      {exams.map(e => (
        <Link href={`/courses/${courseSlug(e.courseKey)}`} class="lrow clash" style={{ '--c': courseColor(e.courseKey) }}>
          <i class="bar" />
          <span class="t"><bdi>{courseTitle(s, e.courseKey)}</bdi></span>
          <span class="m">{strings.value.schedule.exam}{e.start != null && <> · <bdi>{timeRange(e.start, e.end)}</bdi></>}{e.room && <> · <bdi class="mono">{e.room}</bdi></>}</span>
          <span class="e"><span class="chip risk">{strings.value.schedule.exam}</span></span>
        </Link>
      ))}
      {list.map(m => <ClassRow key={m.id} m={m} state={m.state} clash={clash.has(`${date.getDay()}|${m.id}`)} />)}
    </div>
  );
}

export function DayCard({ index }: { index?: number }) {
  const s = snapshot.value!;
  const now = new Date();
  const [day, setDay] = useState(toIsoDate(now));
  const startOfWeek = addDays(now, -((now.getDay() - INSTITUTION.weekStart + 7) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i))
    .filter(d => !INSTITUTION.weekend.includes(d.getDay()) || meetingsOn(s, d).length > 0 || toIsoDate(d) === day);
  const date = fromIsoDate(day);
  return (
    <Card id={`day-${day}`} title={dateLabel(date)} index={index}>
      <div class="chips" data-noshare>
        {days.map(d => {
          const iso = toIsoDate(d);
          return <button class={`chip ${iso === day ? 'ink' : ''}`} aria-pressed={iso === day} onClick={() => setDay(iso)}>{dayName(d.getDay(), 'short')} <span class="mono">{d.getDate()}</span></button>;
        })}
      </div>
      <DayList date={date} />
    </Card>
  );
}

export function MonthCard({ index }: { index?: number }) {
  const s = snapshot.value!;
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(toIsoDate(now));
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() - INSTITUTION.weekStart + 7) % 7;
  const start = addDays(first, -lead);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const visible = days[35]!.getMonth() === month.getMonth() ? days : days.slice(0, 35);
  const examDays = new Set(s.exams.map(e => e.date));
  const clashDays = new Set(clashes(s).flatMap(c => (c.kind === 'class' ? [c.day] : [])));
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const term = currentTerm(s);
  return (
    <Card id="month" title={monthLabel(month)} index={index} actions={
      <span class="row-flex" data-noshare>
        <button class="card-act" aria-label={monthLabel(new Date(month.getFullYear(), month.getMonth() - 1, 1))} onClick={() => shift(-1)}><ChevronLeft class="flip" /></button>
        <button class="card-act" aria-label={monthLabel(new Date(month.getFullYear(), month.getMonth() + 1, 1))} onClick={() => shift(1)}><ChevronRight class="flip" /></button>
      </span>
    }>
      <div class="month" role="grid">
        {Array.from({ length: 7 }, (_, i) => <span class="dow">{dayName((INSTITUTION.weekStart + i) % 7, 'narrow')}</span>)}
        {visible.map(d => {
          const iso = toIsoDate(d);
          const has = meetingsOn(s, d).length > 0 && !(term?.start && iso < term.start);
          return (
            <button class={`${d.getMonth() !== month.getMonth() ? 'out' : ''} ${iso === toIsoDate(now) ? 'today' : ''}`} aria-pressed={iso === selected} aria-label={dateLabel(d)} onClick={() => setSelected(iso)}>
              <span>{d.getDate()}</span>
              <span class="marks">{has && <i class={clashDays.has(d.getDay()) ? 'clash' : ''} />}{examDays.has(iso) && <i class="exam" />}</span>
            </button>
          );
        })}
      </div>
      <p class="day-label">{dateLabel(fromIsoDate(selected))}</p>
      <DayList date={fromIsoDate(selected)} />
    </Card>
  );
}

/** The schedule and exams as a calendar file, made on the device (Docs/21: NUSMods). */
export function exportCalendar() {
  const s = snapshot.value!;
  const t = strings.value;
  const text = toIcs(s, {
    now: new Date(),
    tz: INSTITUTION.timeZone,
    termWeeks: INSTITUTION.termWeeks,
    calendarName: t.schedule.calendarName,
    words: { exam: t.schedule.exam, components: t.components },
    product: PRODUCT.name.en,
  });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'taleeb-schedule.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast(t.schedule.exported);
}

export function ExportCard({ index }: { index?: number }) {
  const t = strings.value.schedule;
  return (
    <Card id="export" title={t.export} index={index} share={false} tone="night" hud>
      <p class="label" style={{ lineHeight: 1.85 }}>{t.exportHint}</p>
      <button class="btn primary block" onClick={exportCalendar}><CalendarPlus />{t.export}</button>
    </Card>
  );
}

