import { DOMParser } from 'linkedom';
import type { AttemptContext } from '../src/core/bot/types';

export const toDoc = (html: string) =>
  new DOMParser().parseFromString(/<html/i.test(html) ? html : `<html><body>${html}</body></html>`, 'text/html') as unknown as Document;

export function testCtx(): AttemptContext & { steps: string[] } {
  const steps: string[] = [];
  return { attempt: 1, signal: new AbortController().signal, steps, step: (label, status) => steps.push(`${label}:${status}`) };
}
