// The PeopleSoft connector against a fake portal that reproduces the real failures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PsError, PsSession } from '../../src/adapters/sources/peoplesoft/edge/session';
import { syncPages } from '../../src/adapters/sources/peoplesoft/edge/sync';
import { PAGE_KEYS } from '../../src/adapters/sources/peoplesoft/pages';
import type { ServerEvent } from '../../src/ports/edge';
import { session, TEST_PS } from './config';
import { fakePortal, LOGIN_FORM } from './fake-portal';

afterEach(() => vi.unstubAllGlobals());

const ALL = PAGE_KEYS;

describe('syncPages', () => {
  it('reads all pages in one session, strips scripts and server notes, signs out', async () => {
    const portal = fakePortal();
    const out = await syncPages(session, '123', 'secret', ALL);
    expect(Object.keys(out.pages)).toEqual(['center', 'grades', 'attendance', 'exams']);
    expect(out.errors).toEqual({});
    expect(out.pages.center).not.toContain('junk');
    expect(out.pages.center).not.toContain('AppServ');
    expect(portal.sessions()).toBe(1);
    expect(portal.log.at(-1)).toContain('cmd=logout');
    expect(out.log.map(s => s.label)).toEqual(['SIGN_IN', 'PAGE center', 'PAGE grades', 'PAGE attendance', 'PAGE exams']);
  });

  it('reports every step as it happens, for the student to see', async () => {
    fakePortal();
    const events: ServerEvent[] = [];
    await syncPages(session, '123', 'secret', ['grades'], e => events.push(e));
    expect(events.map(e => `${e.key}:${e.status}${e.note ? `:${e.note}` : ''}`)).toEqual([
      'signin:start', 'signin:ok', 'fetch:start:grades', 'fetch:ok:grades', 'signout:start', 'signout:ok',
    ]);
  });

  it('starts a fresh session after "not authorized" and stops asking the dead one', async () => {
    const portal = fakePortal({ brokenOnce: ['SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL'] });
    const out = await syncPages(session, '123', 'secret', ALL);
    expect(out.errors).toEqual({});
    expect(Object.keys(out.pages)).toHaveLength(4);
    expect(portal.sessions()).toBe(2);
    const firstSession = portal.log.slice(0, portal.log.findIndex(l => l.includes('cmd=logout')));
    expect(firstSession.some(l => l.includes('A_SLF_ATT'))).toBe(false);
  });

  it('reports pages that fail in both sessions without losing the others', async () => {
    fakePortal({ killOn: ['SA_LEARNER_SERVICES.SSR_SSENRL_EXAM_L.GBL'] });
    const events: ServerEvent[] = [];
    const out = await syncPages(session, '123', 'secret', ALL, e => events.push(e));
    expect(Object.keys(out.pages)).toEqual(['center', 'grades', 'attendance']);
    expect(out.errors).toEqual({ exams: 'NOT_AUTHORIZED' });
    expect(events.filter(e => e.status === 'fail').map(e => e.note)).toEqual(['exams:NOT_AUTHORIZED', 'exams:NOT_AUTHORIZED']);
  });

  it('only fetches the pages asked for', async () => {
    const portal = fakePortal();
    await syncPages(session, '123', 'secret', ['attendance']);
    expect(portal.log.filter(l => l.includes('/c/'))).toEqual(['GET /psc/hp/EMPLOYEE/SA/c/A_AD_MENU.A_SLF_ATT.GBL']);
  });

  it('gives a slow page no second session: the browser decides, after a pause', async () => {
    const portal = fakePortal({ timeoutOn: ['SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL'] });
    const out = await syncPages(session, '123', 'secret', ALL);
    expect(out.errors).toEqual({ grades: 'UPSTREAM' });
    expect(Object.keys(out.pages)).toEqual(['center', 'attendance', 'exams']);
    expect(portal.sessions()).toBe(1);
  });

  it('keeps the first pass when signing in again fails', async () => {
    const portal = fakePortal({ brokenOnce: ['SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL'], signInsAllowed: 1 });
    const out = await syncPages(session, '123', 'secret', ALL);
    expect(Object.keys(out.pages)).toEqual(['center']);
    expect(out.errors).toEqual({ grades: 'NOT_AUTHORIZED', attendance: 'UPSTREAM', exams: 'UPSTREAM' });
    expect(portal.log.filter(l => l.includes('cmd=logout'))).toHaveLength(1);
  });

  it('signs out even when the college refuses Raad midway', async () => {
    const portal = fakePortal({ forbidOn: ['SA_LEARNER_SERVICES.SSR_SSENRL_GRADE.GBL'] });
    await expect(syncPages(session, '123', 'secret', ALL)).rejects.toMatchObject({ code: 'BLOCKED' });
    expect(portal.log.at(-1)).toContain('cmd=logout');
  });
});

describe('sign-in', () => {
  const answer = (html: string) => vi.stubGlobal('fetch', async (_url: string, init: RequestInit = {}) =>
    new Response(init.method === 'POST' ? html : LOGIN_FORM));
  const signIn = () => new PsSession(TEST_PS).login('1', 'pw').then(() => 'ok', (e: PsError) => e.code);

  it('only the sign-in page shown again is a wrong password', async () => {
    answer(`${LOGIN_FORM}<span class="PSERRORTEXT">Your User ID and/or Password are invalid.</span>`);
    expect(await signIn()).toBe('BAD_CREDENTIALS');
  });

  it('a maintenance page is never counted against the student', async () => {
    answer('<html><body><h1>The system is down for maintenance</h1></body></html>');
    expect(await signIn()).toBe('UPSTREAM');
  });

  it('a locked or expired account is the college’s answer about the account, not a wrong password', async () => {
    answer(`${LOGIN_FORM}<span class="PSERRORTEXT">Your account is locked. Contact your administrator.</span>`);
    expect(await signIn()).toBe('ACCOUNT');
    answer('<html><span class="PSERRORTEXT">Your password has expired. Please change your password.</span></html>');
    expect(await signIn()).toBe('ACCOUNT');
  });

  it('asks only for the pages the institution has', async () => {
    fakePortal();
    const s = new PsSession({ ...TEST_PS, pages: ['center'] });
    await s.login('1', 'secret');
    await expect(s.get('attendance')).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  });
});
