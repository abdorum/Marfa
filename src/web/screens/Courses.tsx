import { courseList, courseView, currentTerm, fromIsoDate } from '../../core/derive';
import { courseKeyFromSlug, courseSlug } from '../../core/model';
import { dateLabel, dayName, strings, timeRange } from '../i18n';
import { prefs, snapshot } from '../store/app';
import { componentLabel, Empty, Link, Meter, Row, Tile, TopBar } from '../ui';

export function Courses() {
  const s = snapshot.value!;
  const t = strings.value;
  const term = currentTerm(s);
  const rows = courseList(s, prefs.value);
  const units = rows.reduce((n, r) => n + (r.course.units ?? r.grade?.units ?? 0), 0);
  const maxAbs = Math.max(0, ...rows.map(r => r.attendance?.absencePct ?? 0));
  const gpa = s.termStats.find(x => x.termCode === term?.code)?.gpa;

  return (
    <>
      <TopBar title={t.courses.title} end={term && <span class="pill"><bdi>{term.code}</bdi></span>} />
      <div class="page">
        <div class="tiles">
          <Tile value={units} label={t.courses.units} />
          <Tile value={<bdi>{maxAbs}%</bdi>} label={t.courses.maxAbsence} />
          <Tile value={gpa?.toFixed(2) ?? '—'} label={t.courses.gpa} />
        </div>
        <div class="stack">
          {rows.map(r => (
            <Link href={`/courses/${courseSlug(r.course.key)}`} class="card flat" style={{ display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500 }}>{r.course.title ?? r.course.key}</span>
                <span class="num">{r.grade?.grade ?? t.courses.notPosted}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }} class="label">
                <span><bdi>{r.course.key}</bdi>{r.course.units ? ` · ${t.courses.unitsN(r.course.units)}` : ''}</span>
                {r.attendance && <bdi class={r.level === 'ok' ? '' : r.level}>{r.attendance.absencePct}%</bdi>}
              </div>
              {r.attendance && <Meter pct={r.attendance.absencePct} />}
            </Link>
          ))}
          {!rows.length && <Empty>—</Empty>}
        </div>
      </div>
    </>
  );
}

export function Course({ slug }: { slug: string }) {
  const s = snapshot.value!;
  const t = strings.value;
  const r = courseView(s, courseKeyFromSlug(slug), prefs.value);
  if (!r) return <><TopBar backTo="/courses" title={courseKeyFromSlug(slug)} /><div class="page"><Empty>—</Empty></div></>;

  // One row per day a section meets, in week order.
  const schedule = r.sections
    .flatMap(sec => sec.meetings.flatMap(m => m.days.map(d => ({ d, m, sec }))))
    .sort((a, b) => a.d - b.d || a.m.start - b.m.start);

  return (
    <>
      <TopBar backTo="/courses" crumb={<><Link href="/courses">{t.courses.title}</Link> / <bdi>{r.course.key}</bdi></>} title={r.course.title ?? r.course.key} />
      <div class="page">
        <div class="card raised stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span class="label">{t.course.absence}</span>
            <span class={`big ${r.level === 'ok' ? '' : r.level}`}><bdi>{r.attendance ? `${r.attendance.absencePct}%` : '—'}</bdi></span>
          </div>
          {r.attendance && <Meter pct={r.attendance.absencePct} />}
          {r.attendance?.examStatus && <p class="label">{r.attendance.examStatus}</p>}
        </div>

        <section class="stack">
          <h2 class="section-title">{t.course.schedule}</h2>
          {schedule.map(({ d, m, sec }) => (
            <Row title={dayName(d)} meta={<>{componentLabel(sec.component)} · <bdi>{sec.section}</bdi>{m.room ? ` · ${m.room}` : ''}</>} end={<bdi>{timeRange(m.start, m.end)}</bdi>} />
          ))}
          {!schedule.length && <Empty>—</Empty>}
        </section>

        <div class="tiles" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Tile value={r.grade?.grade ?? '—'} label={t.course.grade} />
          <Tile value={r.exam ? dateLabel(fromIsoDate(r.exam.date), { day: 'numeric', month: 'short' }) : '—'} label={t.course.exam} />
        </div>
      </div>
    </>
  );
}
