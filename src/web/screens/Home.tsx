import { useState } from 'preact/hooks';
import { AlertTriangle, Bell } from 'lucide-preact';
import { academicWeek, alerts, courseList, currentTerm, meetingsOn, withStates, type MeetingView } from '../../core/derive';
import { courseSlug } from '../../core/model';
import { dateLabel, dayName, strings, time, timeRange } from '../i18n';
import { lastJob, prefs, snapshot } from '../store/app';
import { componentLabel, Empty, Forward, Link, Notice, Row, Tile, TopBar } from '../ui';

type Range = 'today' | 'tomorrow' | 'week';

function MeetingRow({ m, state }: { m: MeetingView; state?: string }) {
  return (
    <Row
      href={`/courses/${courseSlug(m.courseKey)}`}
      state={state}
      title={m.title ?? m.courseKey}
      meta={<><bdi>{timeRange(m.start, m.end)}</bdi> · {componentLabel(m.component)}</>}
    />
  );
}

export function Home() {
  const s = snapshot.value!;
  const t = strings.value;
  const now = new Date();
  const [range, setRange] = useState<Range>('today');
  const term = currentTerm(s);
  const week = academicWeek(term, now);
  const today = withStates(meetingsOn(s, now), now);
  const left = today.filter(m => m.state !== 'past').length;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const list = alerts(s, prefs.value, now);
  const rows = courseList(s, prefs.value);
  const graded = rows.filter(r => r.grade?.grade).length;
  const gpa = s.termStats.find(x => x.termCode === term?.code)?.gpa;
  const failed = lastJob.value?.state === 'failed' || lastJob.value?.state === 'needs_input' ? lastJob.value : undefined;

  const body = range === 'today'
    ? today.map(m => <MeetingRow m={m} state={m.state} />)
    : range === 'tomorrow'
      ? meetingsOn(s, tomorrow).map(m => <MeetingRow m={m} />)
      : Array.from({ length: 7 }, (_, k) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k))
          .flatMap(d => {
            const ms = meetingsOn(s, d);
            return ms.length ? [<p class="label">{dayName(d.getDay())}</p>, ...ms.map(m => <MeetingRow m={m} />)] : [];
          });

  return (
    <>
      <TopBar title={dateLabel(now)} crumb={week ? `${t.week(week)} · ${term?.name ?? ''}` : term?.name} />
      <div class="page">
        {failed?.failure && <Notice tone="risk" icon={<AlertTriangle />} href="/raad">{t.failure[failed.failure.kind]}</Notice>}
        <Notice icon={<Bell />}>{t.home.left(left)}</Notice>

        <div class="card raised sidecard">
          <div class="body">
            {body.length ? body : <Empty>{t.home.nothing}</Empty>}
            <div class="end-align"><Link href="/calendar" class="pill solid">{t.home.all} <Forward /></Link></div>
          </div>
          <div class="sidetabs" role="tablist">
            {(['today', 'tomorrow', 'week'] as const).map(r => (
              <button role="tab" aria-selected={range === r} onClick={() => setRange(r)}>{t.home[r]}</button>
            ))}
          </div>
        </div>

        {list.length > 0 && (
          <section class="stack">
            <h2 class="section-title">{t.home.alerts}</h2>
            {list.map(a => {
              if (a.kind === 'attendance') {
                return <Row href={`/courses/${courseSlug(a.record.courseKey)}`} state={a.level === 'risk' ? 'now' : undefined}
                  title={s.courses.find(c => c.key === a.record.courseKey)?.title ?? a.record.courseKey}
                  meta={t.alert.attendance} end={<bdi class={a.level === 'risk' ? 'risk' : 'warn'}>{a.record.absencePct}%</bdi>} />;
              }
              if (a.kind === 'exam') {
                return <Row href={`/courses/${courseSlug(a.exam.courseKey)}`} title={s.courses.find(c => c.key === a.exam.courseKey)?.title ?? a.exam.courseKey}
                  meta={<>{t.alert.exam(a.inDays)}{a.exam.start != null && <> · <bdi>{time(a.exam.start)}</bdi></>}</>} />;
              }
              return <Row href="/me/notices" title={a.notice.title} meta={a.kind === 'hold' ? t.alert.hold : t.alert.todo} />;
            })}
          </section>
        )}

        <div class="tiles">
          <Tile href="/courses" value={rows.length} label={t.home.courses} />
          <Tile href="/courses" value={<bdi>{graded}/{rows.length}</bdi>} label={t.home.graded} />
          <Tile href="/courses" value={gpa?.toFixed(2) ?? '—'} label={t.home.gpa} />
        </div>
      </div>
    </>
  );
}
