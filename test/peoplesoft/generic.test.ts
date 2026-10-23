import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractCapabilities, extractGrids } from '../../src/adapters/peoplesoft/extract/generic';
import { toDoc } from '../helpers';

// A grid the college might add one day, in PeopleSoft's usual markup.
const EVENTS = `
<div id="win0divBMC_EVENTS_GRIDGP$0">College Events</div>
<table id="BMC_EVENTS_GRID$scroll$0"><tr><td><table>
  <tr><th><a id="BMC_EVENTS_GRID$srt0$0">Date</a></th><th><a id="BMC_EVENTS_GRID$srt1$0">Event</a></th><th><a id="BMC_EVENTS_GRID$srt2$0">Place</a></th></tr>
  <tr><td><span id="BMC_EVT_VW_EVENT_DT$0">11/02/2026</span></td><td><span id="BMC_EVT_VW_DESCR$0">Career Day</span></td><td><span id="BMC_EVT_VW_LOCATION$0">Hall A</span></td></tr>
  <tr><td><span id="BMC_EVT_VW_EVENT_DT$1">11/09/2026</span></td><td><span id="BMC_EVT_VW_DESCR$1">Research Week</span></td><td><span id="BMC_EVT_VW_LOCATION$1">&nbsp;</span></td></tr>
  <tr><td><span id="BMC_EVT_VW_EVENT_DT$2">&nbsp;</span></td><td><span id="BMC_EVT_VW_DESCR$2"></span></td><td></td></tr>
</table></td></tr></table>`;

describe('generic grid extractor', () => {
  it('turns an unknown grid into a table block with its own headings', () => {
    expect(extractGrids(toDoc(EVENTS), 'center')).toEqual([{
      id: 'center:BMC_EVENTS_GRID',
      title: 'College Events',
      kind: 'table',
      columns: ['Date', 'Event', 'Place'],
      rows: [['11/02/2026', 'Career Day', 'Hall A'], ['11/09/2026', 'Research Week', '']],
    }]);
  });

  it('falls back to field names when headings do not line up', () => {
    const html = EVENTS.replace(/<a id="BMC_EVENTS_GRID\$srt2\$0">Place<\/a>/, '');
    const [b] = extractGrids(toDoc(html), 'center');
    expect(b!.columns).toEqual(['event dt', 'descr', 'location']);
  });

  it('skips grids that are already mapped', () => {
    const html = EVENTS.replace(/BMC_EVENTS_GRID/g, 'STDNT_WEEK_SCHD');
    expect(extractGrids(toDoc(html), 'center')).toEqual([]);
  });
});

const fixture = (name: string) => {
  const f = new URL(`../fixtures/peoplesoft/${name}.html`, import.meta.url);
  return existsSync(f) ? toDoc(readFileSync(f, 'utf8')) : undefined;
};

describe.skipIf(!fixture('center'))('generic extractor on real pages', () => {
  it('finds nothing unknown on today’s pages', () => {
    for (const p of ['center', 'grades', 'attendance', 'exams'] as const) {
      expect(extractGrids(fixture(p)!, p)).toEqual([]);
    }
  });

  it('reads what the Student Center menu offers', () => {
    expect(extractCapabilities(fixture('center')!)).toEqual(['Assignments', 'Enrollment: Add', 'Exam Schedule', 'Grades', 'Transfer Credit: Report']);
  });
});
