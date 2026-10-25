// The generic extractor: finds every PeopleSoft grid on a page without
// knowing it in advance. Grids we already map (registry.json → known) are
// skipped; anything else becomes an "extra" block on the More page, so a table
// the college adds tomorrow shows up without a code change (ADR-009).
import type { ExtraBlock } from '../../../../core/model';
import type { PageKey } from '../pages';
import registry from '../registry.json';
import { clean } from './dom';

export type FoundBlock = Omit<ExtraBlock, 'firstSeen' | 'lastSeen' | 'missed'>;

const CONTROL = /\$(srt\d+|hpers|hfind|hmodal|hexcel|scroll)\$|GP\$|^win0|^ICField/;
const FIELD_ID = /^(.+?)(?:\$span)?\$(\d+)$/;

/** Text of a grid label, without PeopleSoft's "Personalize | Find | First 1-3 of 3 Last" chrome. */
function gridTitle(doc: Document, name: string, grid: Element): string {
  const raw = clean((doc.getElementById(`win0div${name}GP$0`) ?? grid.querySelector('[class*="GRIDLABEL"]'))?.textContent);
  return raw.split(/Personalize|\|\s*Find|First\s+\d/)[0]!.trim();
}

export function extractGrids(doc: Document, page: PageKey): FoundBlock[] {
  const known = new Set<string>(registry.known);
  const out: FoundBlock[] = [];

  for (const grid of Array.from(doc.querySelectorAll('[id$="$scroll$0"]'))) {
    const name = grid.id.replace(/\$scroll\$0$/, '');
    const id = `${page}:${name}`;
    if (known.has(id) || name.startsWith('$')) continue;

    // Cells: leaf elements whose id is FIELD$row; group them by row.
    const byRow = new Map<number, Map<string, string>>();
    const fields: string[] = [];
    for (const el of Array.from(grid.querySelectorAll('[id]'))) {
      if (CONTROL.test(el.id) || el.querySelector('[id]')) continue;
      const m = FIELD_ID.exec(el.id);
      if (!m) continue;
      const [, field, row] = m;
      if (!fields.includes(field!)) fields.push(field!);
      const r = byRow.get(Number(row)) ?? new Map<string, string>();
      r.set(field!, clean(el.textContent));
      byRow.set(Number(row), r);
    }
    const rows = [...byRow.entries()].sort(([a], [b]) => a - b)
      .map(([, r]) => fields.map(f => r.get(f) ?? ''))
      .filter(r => r.some(Boolean));
    if (!rows.length) continue;

    // Column titles from the sort links, when they line up with the fields.
    const headers = Array.from(grid.querySelectorAll(`[id^="${name}$srt"]`)).map(a => clean(a.textContent));
    const columns = headers.length === fields.length ? headers : humanize(fields);
    if (columns.some(c => /^Exam Date$/i.test(c))) continue; // mapped by the exams extractor

    out.push({ id, title: gridTitle(doc, name, grid) || name, kind: 'table', columns, rows });
  }
  return out;
}

/** "BMC_EVT_VW_EVENT_DT", "BMC_EVT_VW_DESCR" → "event dt", "descr" (drops the shared record name). */
function humanize(fields: string[]): string[] {
  let prefix = fields[0] ?? '';
  for (const f of fields) while (!f.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = fields.length > 1 ? prefix.slice(0, prefix.lastIndexOf('_') + 1) : '';
  return fields.map(f => f.slice(prefix.length).replace(/_/g, ' ').toLowerCase());
}

/** What the student can do, as listed by PeopleSoft's own Student Center menu. */
export function extractCapabilities(doc: Document): string[] {
  const select = doc.getElementById('DERIVED_SSS_SCL_SSS_MORE_ACADEMICS');
  if (!select) return [];
  return Array.from(select.querySelectorAll('option'))
    .map(o => clean(o.textContent))
    .filter(t => t && !/^other /i.test(t));
}

/** Translated title for a block, if the registry promotes it. */
export function promotedTitle(id: string, lang: 'ar' | 'en'): string | undefined {
  return (registry.promote as Record<string, { title?: { ar?: string; en?: string } }>)[id]?.title?.[lang];
}
