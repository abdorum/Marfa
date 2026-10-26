// The PeopleSoft connector for Raad's server (src/ports/edge.ts). Where the
// college system lives comes from the institution profile; how Raad introduces
// himself comes from his server. Nothing here names an institution.
import type { InstitutionProfile } from '../../../../core/institution';
import type { ConnectorEnv, EdgeConnector } from '../../../../ports/edge';
import { isPageKey, PAGE_KEYS, type PsConfig } from '../pages';
import { PsSession } from './session';
import { syncPages } from './sync';

/** The profile's PeopleSoft settings as the session needs them. */
export function psConfig(institution: InstitutionProfile, env: ConnectorEnv): PsConfig {
  const ps = institution.peoplesoft;
  if (!ps) throw new Error(`${institution.id} has no PeopleSoft settings`);
  return {
    base: ps.base,
    site: ps.site,
    timezoneOffset: String(-institution.timeZone.offsetMinutes),
    userAgent: env.userAgent,
    pages: PAGE_KEYS.filter(k => ps.pages.includes(k)),
  };
}

export function createPeopleSoftConnector(config: PsConfig): EdgeConnector {
  return {
    id: 'peoplesoft',
    parts: config.pages,
    sync: (userid, pwd, parts, emit) =>
      syncPages(() => new PsSession(config), userid, pwd, config.pages.filter(k => parts.filter(isPageKey).includes(k)), emit),
    // Opens the sign-in page only; never signs in.
    async health() {
      try {
        const res = await fetch(`${config.base}/psp/${config.site}/?cmd=login&languageCd=ENG&`, { headers: { 'User-Agent': config.userAgent }, redirect: 'manual' });
        // The answer is public: the status alone, never what the college's
        // servers said or which of them answered (that is their business).
        await res.body?.cancel();
        return { sis: res.status, reachable: res.status === 200 };
      } catch (e) {
        return { sis: 0, reachable: false, error: (e as Error).name };
      }
    },
  };
}
