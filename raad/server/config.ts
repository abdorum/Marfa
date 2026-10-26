// Raad's server settings that are not secrets. The owner's switches (pause,
// announcement, pages to skip, how often devices refresh) are Worker variables
// instead, so they change without a deploy.

/** The sites allowed to call Raad from a browser. */
export const SITE_ORIGINS = ['https://taleeb-portal.pages.dev'];

/** Raad's own version, shown by /api/v1/status. */
export const RAAD_VERSION = '1.2.1';

/** How Raad introduces himself to the systems he reads, so their IT can reach the owner instead of blocking him. */
export const USER_AGENT = `TaleebPortal-Raad/${RAAD_VERSION} (+https://t.me/ItsProf11)`;
