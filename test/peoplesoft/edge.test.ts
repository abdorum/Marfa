// The PeopleSoft connector against a fake portal that reproduces the real failures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '../../raad/server/connector';
import { syncPages } from '../../src/adapters/sources/peoplesoft/edge/sync';
import { fakePortal } from './fake-portal';

afterEach(() => vi.unstubAllGlobals());

describe('syncPages', () => {
  it('reads all pages in one session, strips scripts, signs out', async () => {
    const portal = fakePortal();
    const out = await syncPages('123', 'secret');
    expect(Object.keys(out.pages)).toEqual(['center', 'grades', 'attendance', 'exams']);
    expect(out.errors).toEqual({});
    expect(out.pages.center).not.toContain('junk');
    expect(portal.sessions()).toBe(1);
    expect(portal.log.at(-1)).toContain('cmd=logout');
    expect(out.log.map(s => s.label)).toEqual(['SIGN_IN', 'PAGE center', 'PAGE grades', 'PAGE attendance', 'PAGE exams']);
  });

  it('reports every step as it happens, for the student to see', async () => {
    fakePortal();
    const events: ServerEvent[] = [];
    await syncPages('123', 'secret', ['grades'], undefined, e => events.push(e));
    expect(events.map(e => `${e.key}:${e.status}${e.note ? `:${e.note}` : ''}`)).toEqual([
      'signin:start', 'signin:ok', 'fetch:start:grades', 'fetch:ok:grades', 'signout:start', 'signout:ok',
    ]);
  });

  it('starts a fresh session after "not authorized" and stops asking the dead one', async () => {
    const portal = fakePortal({ brokenOnce: ['SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL'] });
    const out = await syncPages('123', 'secret');
    expect(out.errors).toEqual({});
    expect(Object.keys(out.pages)).toHaveLength(4);
    expect(portal.sessions()).toBe(2);
    const firstSession = portal.log.slice(0, portal.log.findIndex(l => l.includes('cmd=logout')));
    expect(firstSession.some(l => l.includes('A_SLF_ATT'))).toBe(false);
  });

  it('reports pages that fail in both sessions without losing the others', async () => {
    fakePortal({ killOn: ['SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL'] });
    const events: ServerEvent[] = [];
    const out = await syncPages('123', 'secret', undefined, undefined, e => events.push(e));
    expect(Object.keys(out.pages)).toEqual(['center', 'grades', 'attendance']);
    expect(out.errors).toEqual({ exams: 'NOT_AUTHORIZED' });
    expect(events.filter(e => e.status === 'fail').map(e => e.note)).toEqual(['exams:NOT_AUTHORIZED', 'exams:NOT_AUTHORIZED']);
  });

  it('only fetches the pages asked for', async () => {
    const portal = fakePortal();
    await syncPages('123', 'secret', ['attendance']);
    expect(portal.log.filter(l => l.includes('/c/'))).toEqual(['GET /psc/hp/EMPLOYEE/SA/c/A_AD_MENU.A_SLF_ATT.GBL']);
  });
});
