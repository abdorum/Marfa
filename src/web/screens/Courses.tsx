// Courses: one card per course, with its components (lecture, lab…), its
// absence and what is left before the limit, and its grade.
import { CalendarClock, ShieldAlert } from 'lucide-preact';
import { absenceBudget, attendanceLevel, courseList, courseView, currentTerm, fromIsoDate, meetingsOnDay, type CourseRow } from '../../core/derive';
import { courseKeyFromSlug, courseSlug } from '../../core/model';
import { INSTITUTION } from '../../institutions';
import { Card } from '../cards/Card';
import { dateLabel, dayName, strings, timeRange } from '../i18n';
import { courseColor, prefs, snapshot } from '../state';
import { Chevrons, componentLabel, Empty, Link, Meter, TopBar } from '../ui';

function nextClassDay(key: string): number | undefined {
  const s = snapshot.value!;
  const today = new Date().getDay();
  for (let k = 0; k < 7; k++) {
    const d = (today + k) % 7;
    if (meetingsOnDay(s, d).some(m => m.courseKey === key)) return d;
  }
  return undefined;
}

function CourseCard({ r, index, detail }: { r: CourseRow; index?: number; detail?: boolean }) {
  const s = snapshot.value!;
  const t = strings.value;
  const limit = prefs.value.absenceLimit;
  const pct = r.attendance?.absencePct;
  const budget = pct != null ? absenceBudget(s, r.course.key, pct, limit, INSTITUTION.termWeeks) : undefined;
  const level = pct != null ? attendanceLevel(pct, limit) : 'ok';
  const day = nextClassDay(r.course.key);
  const body = (
    <>
      <div class="course-top">
        <div class="title">
          <h3><bdi>{r.course.title ?? r.course.key}</bdi></h3>
          {r.course.units ? <p class="code">{t.courses.unitsN(r.course.units)}</p> : null}
        </div>
        <div class={`grade-badge${r.grade?.grade ? ' posted' : ''}`}>
          <b><bdi>{r.grade?.grade ?? '—'}</bdi></b>
          <small>{r.grade?.grade ? t.course.grade : t.courses.notPosted}</small>
        </div>
      </div>
      <div class="chips">
        {r.sections.map(x => <span class="chip">{componentLabel(x.component)} <bdi class="mono">{x.section}</bdi></span>)}
        {r.attendance?.examStatus && <span class="chip risk"><ShieldAlert />{t.course.barred}</span>}
        {day != null && !detail && <span class="chip"><CalendarClock />{dayName(day)}</span>}
      </div>
      {pct != null && (
        <div class="absence-line">
          <div class="row-flex">
            <span class="label">{t.course.absence}</span>
            <span class={`chip ${level}`}>{t.attendance.levels[level]} · <bdi>{pct}%</bdi></span>
          </div>
          <Meter pct={pct} limit={limit} />
          {budget && (
            <>
              <Chevrons used={budget.used} allowed={budget.allowed} level={level} />
              <p class="label">{t.attendance.left(budget)}</p>
              {detail && <p class="label">{t.attendance.estimate(budget.total, budget.allowed, budget.endKnown)}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
  return (
    <Card id={`course-${courseSlug(r.course.key)}`} title={<bdi class="mono">{r.course.key}</bdi>} index={index} class="course-card" style={{ '--c': courseColor(r.course.key) }}>
      {detail ? body : <Link href={`/courses/${courseSlug(r.course.key)}`} class="stack" style={{ color: 'inherit' }}>{body}</Link>}
    </Card>
  );
}

export function Courses() {
  const s = snapshot.value!;
  const t = strings.value.courses;
  const term = currentTerm(s);
  const rows = courseList(s, prefs.value);
  const units = rows.reduce((n, r) => n + (r.course.units ?? r.grade?.units ?? 0), 0);
  const graded = rows.filter(r => r.grade?.grade).length;
  const top = Math.max(0, ...rows.map(r => r.attendance?.absencePct ?? 0));
  return (
    <>
      <TopBar title={t.title} crumb={term?.name ? <bdi>{term.name}</bdi> : undefined} />
      <main class="page">
        <div class="stats card">
          <div class="stat"><b>{rows.length}</b><span>{t.count}</span></div>
          <div class="stat"><b>{units || '—'}</b><span>{t.units}</span></div>
          <div class="stat"><b><bdi>{graded}/{rows.length}</bdi></b><span>{t.graded}</span></div>
          <div class="stat"><b><bdi>{top}%</bdi></b><span>{t.topAbsence}</span></div>
        </div>
        {rows.map((r, i) => <CourseCard key={r.course.key} r={r} index={i + 1} />)}
        {!rows.length && <div class="card"><Empty>{strings.value.empty}</Empty></div>}
      </main>
    </>
  );
}

export function Course({ slug }: { slug: string }) {
  const s = snapshot.value!;
  const t = strings.value;
  // A link typed or shared in another case still finds its course.
  const asked = courseKeyFromSlug(slug);
  const key = s.courses.find(c => c.key.toLowerCase() === asked.toLowerCase())?.key ?? asked;
  const r = courseView(s, key, prefs.value);
  if (!r) return <><TopBar backTo="/courses" title={<bdi>{key}</bdi>} /><main class="page"><div class="card"><Empty>{t.empty}</Empty></div></main></>;

  // One row per day a component meets, in week order.
  const times = r.sections
    .flatMap(sec => sec.meetings.flatMap(m => m.days.map(d => ({ d, m, sec }))))
    .sort((a, b) => ((a.d - INSTITUTION.weekStart + 7) % 7) - ((b.d - INSTITUTION.weekStart + 7) % 7) || a.m.start - b.m.start);

  return (
    <>
      <TopBar backTo="/courses" crumb={<Link href="/courses">{t.courses.title}</Link>} title={<bdi>{r.course.title ?? r.course.key}</bdi>} />
      <main class="page">
        <CourseCard r={r} index={1} detail />
        <Card id={`times-${slug}`} title={t.course.schedule} index={2}>
          {times.length ? (
            <div class="list">
              {times.map(({ d, m, sec }) => (
                <div class="lrow" style={{ '--c': courseColor(r.course.key) }}>
                  <i class="bar" />
                  <span class="t">{dayName(d)} <span class="label">· {componentLabel(sec.component)}</span></span>
                  <span class="m"><bdi>{timeRange(m.start, m.end)}</bdi></span>
                  {m.room && <span class="e"><span class="chip"><bdi class="mono">{m.room}</bdi></span></span>}
                </div>
              ))}
            </div>
          ) : <Empty>{t.empty}</Empty>}
        </Card>
        {r.exam && (
          <Card id={`exam-${slug}`} title={t.course.exam} index={3}>
            <div class="lrow" style={{ '--c': courseColor(r.course.key) }}>
              <i class="bar" />
              <span class="t">{dateLabel(fromIsoDate(r.exam.date))}</span>
              <span class="m">{r.exam.start != null && <bdi>{timeRange(r.exam.start, r.exam.end)}</bdi>}{r.exam.room && <> · <bdi class="mono">{r.exam.room}</bdi></>}</span>
            </div>
          </Card>
        )}
        {r.attendance?.examStatus && <p class="card label"><bdi>{r.attendance.examStatus}</bdi></p>}
        <p class="on-bg-muted" style={{ fontSize: '12.5px', textAlign: 'center' }}>{t.course.official}</p>
      </main>
    </>
  );
}
