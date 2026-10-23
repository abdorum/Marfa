import { useState } from 'preact/hooks';
import { CalendarDays, ChevronLeft } from 'lucide-preact';
import { currentTerm, fromIsoDate, meetingsOn, toIsoDate } from '../../core/derive';
import { courseSlug, type Snapshot } from '../../core/model';
import { dateLabel, dayName, monthLabel, strings, time, timeRange } from '../i18n';
import { snapshot } from '../store/app';
import { componentLabel, Empty, Row, TopBar } from '../ui';

type Filter = 'all' | 'classes' | 'exams';

/** Classes only count inside the term's dates (when known). */
function classesOn(s: Snapshot, d: Date) {
  const term = currentTerm(s);
  const iso = toIsoDate(d);
  if (term?.start && iso < term.start) return [];
  if (term?.end && iso > term.end) return [];
  return meetingsOn(s, d);
}

export function Calendar() {
  const s = snapshot.value!;
  const t = strings.value;
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(toIsoDate(now));
  const [filter, setFilter] = useState<Filter>('all');

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const visible = days[35]!.getMonth() === month.getMonth() ? days : days.slice(0, 35);
  const examDays = new Set(s.exams.map(e => e.date));
  const day = fromIsoDate(selected);
  const classes = filter === 'exams' ? [] : classesOn(s, day);
  const exams = filter === 'classes' ? [] : s.exams.filter(e => e.date === selected);
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const filters: Filter[] = ['all', 'classes', 'exams'];

  return (
    <>
      <TopBar title={t.calendar.title} end={
        <span class="pill" style={{ paddingInline: '6px' }}>
          <button class="icon-btn" style={{ inlineSize: '32px', blockSize: '32px', background: 'none' }} aria-label="−" onClick={() => shift(-1)}><ChevronLeft class="flip" /></button>
          <CalendarDays /> {monthLabel(month)}
          <button class="icon-btn" style={{ inlineSize: '32px', blockSize: '32px', background: 'none' }} aria-label="+" onClick={() => shift(1)}><ChevronLeft class="flip-ltr" /></button>
        </span>
      } />
      <div class="page">
        <div class="card">
          <div class="month" role="grid">
            {Array.from({ length: 7 }, (_, d) => <span class="dow">{dayName(d, 'narrow')}</span>)}
            {visible.map(d => {
              const iso = toIsoDate(d);
              const has = classesOn(s, d).length > 0;
              return (
                <button
                  class={`${d.getMonth() !== month.getMonth() ? 'out' : ''} ${iso === toIsoDate(now) ? 'today' : ''}`}
                  aria-pressed={iso === selected}
                  aria-label={dateLabel(d)}
                  onClick={() => setSelected(iso)}
                >
                  <span class="num">{d.getDate()}</span>
                  <span class="marks">{has && <i />}{examDays.has(iso) && <i class="ring" />}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section class="sheet">
          <span class="grab" />
          <div class="head">
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 500 }}>{dateLabel(day, { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
              <p class="label">{dayName(day.getDay())}</p>
            </div>
            <button class="pill" onClick={() => setFilter(filters[(filters.indexOf(filter) + 1) % filters.length]!)}>{t.calendar[filter]}</button>
          </div>
          {exams.map(e => (
            <Row outlined href={`/courses/${courseSlug(e.courseKey)}`} state="now"
              title={s.courses.find(c => c.key === e.courseKey)?.title ?? e.courseKey}
              meta={<>{t.calendar.exam} · <bdi>{e.start != null ? timeRange(e.start, e.end) : ''}</bdi>{e.room ? ` · ${e.room}` : ''}</>} />
          ))}
          {classes.map(m => (
            <Row outlined href={`/courses/${courseSlug(m.courseKey)}`} title={m.title ?? m.courseKey}
              meta={<><bdi>{time(m.start)} – {time(m.end)}</bdi> · {componentLabel(m.component)}{m.room ? ` · ${m.room}` : ''}</>} />
          ))}
          {!exams.length && !classes.length && <Empty>—</Empty>}
        </section>
      </div>
    </>
  );
}
