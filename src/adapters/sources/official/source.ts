// The official source, ready for the day the college IT exposes the
// read-only API in Docs/11-integration-contract.md. It passes the same
// contract tests as the PeopleSoft source, so switching is a configuration
// change, not a rewrite.
import { RaadError } from '../../../../raad/engine/types';
import { normalizeCourseKey, parseCourseKey, type Course, type DataArea, type Provenance, type SyncResult } from '../../../core/model';
import type { AdapterManifest, SourceContext, StudentDataSource } from '../../../ports/source';

export const OFFICIAL_MANIFEST: AdapterManifest = {
  id: 'official',
  reads: 'The read-only API in Docs/11-integration-contract.md',
  tier: 'B',
  provides: ['student', 'schedule', 'attendance', 'grades', 'exams', 'notices'],
  credentials: 'token',
  maintainer: 'owner',
  readOnly: true,
};

// ----- Wire format (Docs/11-integration-contract.md) -----
export interface ApiMe { id: string; name: { ar?: string; en?: string }; program?: string; email?: string; advisor?: string }
export interface ApiTerm { code: string; name?: string; start?: string; end?: string; current: boolean }
export interface ApiMeeting { days: number[]; start: string; end: string; room?: string }
export interface ApiEnrollment { course: string; title?: string; units?: number; section: string; component: string; classNbr?: string; meetings: ApiMeeting[] }
export interface ApiAttendance { course: string; title?: string; absencePct: number; examStatus?: string | null }
export interface ApiGrade { course: string; grade?: string | null; points?: number | null; units?: number | null }
export interface ApiExam { course: string; date: string; start?: string; end?: string; room?: string }
export interface ApiNotices { holds: { title: string; detail?: string }[]; todos: { title: string; detail?: string }[] }

export interface OfficialSourceOptions {
  baseUrl: string;
  /** The student's OIDC access token from the college's identity provider. */
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
  institution?: string;
}

/** "13:30" → 810 */
const minutes = (hhmm?: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

export function createOfficialSource(opts: OfficialSourceOptions): StudentDataSource {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function get<T>(path: string, ctx: SourceContext): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(new URL(path, opts.baseUrl).href, {
        headers: { Authorization: `Bearer ${await opts.getToken()}`, Accept: 'application/json' },
        signal: ctx.signal,
      });
    } catch (e) {
      throw new RaadError(ctx.signal.aborted ? 'CANCELLED' : 'TRANSIENT', (e as Error).message);
    }
    if (res.status === 401 || res.status === 403) throw new RaadError('CREDENTIALS');
    if (res.status === 429) throw new RaadError('RATE_LIMIT');
    if (!res.ok) throw new RaadError(res.status >= 500 ? 'TRANSIENT' : 'UNEXPECTED', `HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }

  return {
    manifest: OFFICIAL_MANIFEST,
    async sync(ctx: SourceContext): Promise<SyncResult> {
      const t0 = Date.now();
      ctx.step('connect', 'start');
      const [me, terms] = await Promise.all([get<ApiMe>('/v1/me', ctx), get<ApiTerm[]>('/v1/terms', ctx)]);
      ctx.step('connect', 'ok', { ms: Date.now() - t0 });
      const term = terms.find(t => t.current) ?? terms[terms.length - 1];
      if (!term) throw new RaadError('UNEXPECTED', 'NO_TERM');
      const code = term.code;
      const fetchedAt = new Date().toISOString();

      // Each area is independent: one failing endpoint must not lose the others.
      const settle = async <T>(area: DataArea, path: string) => {
        const s0 = Date.now();
        ctx.step('fetch', 'start', { areas: [area] });
        try {
          const v = await get<T>(path, ctx);
          ctx.step('fetch', 'ok', { ms: Date.now() - s0, areas: [area] });
          return v;
        } catch (e) {
          ctx.step('fetch', 'fail', { ms: Date.now() - s0, note: (e as RaadError).kind, areas: [area] });
          if ((e as RaadError).kind === 'CREDENTIALS') throw e;
          return undefined;
        }
      };
      const [enr, att, grd, exm, notices] = await Promise.all([
        settle<{ items: ApiEnrollment[] }>('schedule', `/v1/terms/${code}/enrollments`),
        settle<{ items: ApiAttendance[] }>('attendance', `/v1/terms/${code}/attendance`),
        settle<{ items: ApiGrade[]; gpa?: number; unitsTaken?: number; unitsPassed?: number; unitsInProgress?: number }>('grades', `/v1/terms/${code}/grades`),
        settle<{ items: ApiExam[] }>('exams', `/v1/terms/${code}/exams`),
        settle<ApiNotices>('notices', '/v1/notices'),
      ]);

      const courses = new Map<string, Course>();
      const course = (raw: string, extra: Partial<Course> = {}) => {
        const key = normalizeCourseKey(raw);
        courses.set(key, { ...(courses.get(key) ?? { key, ...parseCourseKey(key) }), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null)) });
        return key;
      };

      const fresh: Provenance = { status: 'fresh', fetchedAt };
      const failed: Provenance = { status: 'error', error: 'UPSTREAM' };
      const provenance: Partial<Record<DataArea, Provenance>> = {
        student: fresh,
        schedule: enr ? fresh : failed,
        attendance: att ? fresh : failed,
        grades: grd ? fresh : failed,
        exams: exm ? fresh : failed,
        notices: notices ? fresh : failed,
      };

      return {
        fetchedAt,
        provenance,
        data: {
          student: {
            id: me.id,
            name: me.name,
            firstName: { ar: me.name.ar?.split(' ')[0], en: me.name.en?.split(' ')[0] },
            program: me.program,
            institution: opts.institution ?? '',
            email: me.email,
            advisor: me.advisor,
          },
          terms: terms.map(t => ({ code: t.code, name: t.name, start: t.start, end: t.end, current: t.code === code })),
          sections: enr?.items.map(e => ({
            courseKey: course(e.course, { title: e.title, units: e.units }),
            termCode: code,
            section: e.section,
            component: e.component,
            classNbr: e.classNbr,
            meetings: e.meetings.map(m => ({ days: m.days, start: minutes(m.start) ?? 0, end: minutes(m.end) ?? 0, room: m.room })),
          })),
          attendance: att?.items.map(a => ({ courseKey: course(a.course, { title: a.title }), termCode: code, scope: 'semester' as const, absencePct: a.absencePct, examStatus: a.examStatus ?? undefined })),
          grades: grd?.items.map(g => ({ courseKey: course(g.course, { units: g.units ?? undefined }), termCode: code, grade: g.grade ?? undefined, points: g.points ?? undefined, units: g.units ?? undefined })),
          termStats: grd ? [{ termCode: code, gpa: grd.gpa, unitsTaken: grd.unitsTaken, unitsPassed: grd.unitsPassed, unitsInProgress: grd.unitsInProgress, raw: {} }] : undefined,
          exams: exm?.items.map(x => ({ courseKey: course(x.course), termCode: code, date: x.date, start: minutes(x.start), end: minutes(x.end), room: x.room })),
          holds: notices?.holds.map(n => ({ kind: 'hold' as const, ...n })),
          todos: notices?.todos.map(n => ({ kind: 'todo' as const, ...n })),
          courses: [...courses.values()],
        },
      };
    },
  };
}
