// DOM helpers for PeopleSoft Classic pages. Grid cells carry ids of the form
// FIELD$<row>, so most extraction is "walk rows by id".

export const clean = (s: string | null | undefined) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

export const text = (doc: Document, id: string) => clean(doc.getElementById(id)?.textContent);

/** The element's text split at <br> tags. */
export function lines(doc: Document, id: string): string[] {
  const el = doc.getElementById(id);
  if (!el) return [];
  const out = [''];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeName === 'BR') out.push('');
      else if (child.nodeType === 3) out[out.length - 1] += child.textContent ?? '';
      else walk(child);
    }
  };
  walk(el);
  return out.map(clean).filter(Boolean);
}

/** The page is not the one an extractor knows. */
export class NotThisPage extends Error {
  constructor(page: string) {
    super(`landmarks of ${page} not found`);
    this.name = 'NotThisPage';
  }
}

/**
 * Every extractor checks first that the page is the one it knows, by ids that
 * are always there (Docs/10). When the college changes its pages, the result
 * is an error, never an empty schedule taken for the truth.
 */
export function landmark(doc: Document, page: string, ids: string[], text?: RegExp): void {
  if (ids.some(id => doc.getElementById(id))) return;
  if (text && text.test(doc.body?.textContent ?? '')) return;
  throw new NotThisPage(page);
}

/** Row indexes 0..n-1 for which `probeId(i)` exists. */
export function rows(doc: Document, probeId: (i: number) => string): number[] {
  const out: number[] = [];
  for (let i = 0; doc.getElementById(probeId(i)); i++) out.push(i);
  return out;
}

/** Cells that belong to this row, not to tables nested inside it. */
export const cellsOf = (tr: Element) => Array.from(tr.children).filter(c => c.nodeName === 'TD' || c.nodeName === 'TH');

/** "MM/DD/YYYY" → "YYYY-MM-DD" */
export function usDateToIso(s: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}` : undefined;
}

/** "4:00PM" → 960 */
export function toMinutes(t: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}

const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; // index = JS getDay()

/** "MoTuWeThSu" → [1, 2, 3, 4, 0] */
export function parseDays(code: string): number[] {
  const days: number[] = [];
  for (let i = 0; i < code.length; i += 2) {
    const idx = DAY_CODES.indexOf(code.slice(i, i + 2));
    if (idx >= 0) days.push(idx);
  }
  return days;
}

export const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
};
