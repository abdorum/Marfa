import { DOMParser } from 'linkedom';
import type { AttemptContext, StepEvent } from '../raad/engine/types';

export const toDoc = (html: string) =>
  new DOMParser().parseFromString(/<html/i.test(html) ? html : `<html><body>${html}</body></html>`, 'text/html') as unknown as Document;

/** An attempt context that records steps as "key:status" (and the events themselves). */
export function testCtx(): AttemptContext & { steps: string[]; events: Omit<StepEvent, 'at'>[] } {
  const steps: string[] = [];
  const events: Omit<StepEvent, 'at'>[] = [];
  return {
    attempt: 1, signal: new AbortController().signal, steps, events,
    step: (key, status, extra) => { steps.push(`${key}:${status}`); events.push({ key, status, ...extra }); },
  };
}
