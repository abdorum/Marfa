// Pieces several cards share: a class row, a course's name.
import { courseSlug, type Snapshot } from '../../core/model';
import type { MeetingState, MeetingView } from '../../core/derive';
import { strings, time } from '../i18n';
import { courseColor } from '../state';
import { componentLabel, Link } from '../ui';

/** A course's title as the source writes it, else its code. */
export const courseTitle = (s: Snapshot, key: string) => s.courses.find(c => c.key === key)?.title ?? key;

export function ClassRow({ m, state, clash }: { m: MeetingView; state?: MeetingState; clash?: boolean }) {
  const t = strings.value;
  return (
    <Link href={`/courses/${courseSlug(m.courseKey)}`} class={`lrow with-time ${state ?? ''} ${clash ? 'clash' : ''}`} style={{ '--c': courseColor(m.courseKey) }}>
      <span class="tm"><b>{time(m.start)}</b>{time(m.end)}</span>
      <i class="bar" aria-hidden="true" />
      <span class="t"><bdi>{m.title ?? m.courseKey}</bdi></span>
      <span class="m">{componentLabel(m.component)}{m.room ? <> · <bdi class="mono">{m.room}</bdi></> : null}</span>
      <span class="e">
        {state === 'now' && <span class="chip ink">{t.now.now}</span>}
        {state === 'next' && <span class="chip">{t.now.next}</span>}
        {clash && <span class="chip risk">{t.now.clash}</span>}
      </span>
    </Link>
  );
}
