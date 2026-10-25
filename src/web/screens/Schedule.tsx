// The schedule: the week as a grid, a day, or a month; and the calendar export.
import { useState } from 'preact/hooks';
import { CalendarPlus } from 'lucide-preact';
import { clashes } from '../../core/derive';
import { ClashesCard } from '../cards/home';
import { DayCard, exportCalendar, ExportCard, MonthCard, WeekCard } from '../cards/schedule';
import { strings } from '../i18n';
import { snapshot } from '../state';
import { TopBar } from '../ui';

type View = 'week' | 'day' | 'month';
let remembered: View = 'week';

export function Schedule() {
  const t = strings.value.schedule;
  const [view, setView] = useState<View>(remembered);
  const pick = (v: View) => { remembered = v; setView(v); };
  return (
    <>
      <TopBar title={t.title} end={<button class="icon-btn" aria-label={t.export} onClick={exportCalendar}><CalendarPlus /></button>} />
      <main class="page">
        <div class="seg" role="tablist" style={{ justifySelf: 'start' }}>
          {(['week', 'day', 'month'] as const).map(v => <button role="tab" aria-pressed={view === v} aria-selected={view === v} onClick={() => pick(v)}>{t.views[v]}</button>)}
        </div>
        {view === 'week' && <WeekCard index={1} />}
        {view === 'day' && <DayCard index={1} />}
        {view === 'month' && <MonthCard index={1} />}
        <ClashesCard index={2} />
        <ExportCard index={clashes(snapshot.value!).length ? 3 : 2} />
      </main>
    </>
  );
}
