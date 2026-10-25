// The PeopleSoft connector for Raad's server (raad/server/connector.ts).
import type { EdgeConnector } from '../../../../../raad/server/connector';
import { isPageKey, PAGE_KEYS } from '../pages';
import { LOGIN_PAGE, USER_AGENT } from './session';
import { syncPages } from './sync';

export const peoplesoftConnector: EdgeConnector = {
  id: 'peoplesoft',
  parts: PAGE_KEYS,
  sync: (userid, pwd, parts, emit) => syncPages(userid, pwd, parts.filter(isPageKey), undefined, emit),
  // Opens the sign-in page only; never signs in.
  async health() {
    try {
      const res = await fetch(LOGIN_PAGE, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' });
      // Who refused: the sign-in page holds no personal data, so its start is safe to show.
      const said = res.status === 200 ? undefined : (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
      const by = ['server', 'x-oracle-dms-ecid', 'x-azure-ref', 'x-cache', 'via'].filter(h => res.headers.has(h));
      return { sis: res.status, reachable: res.status === 200, said, by };
    } catch (e) {
      return { sis: 0, reachable: false, error: (e as Error).name };
    }
  },
};
