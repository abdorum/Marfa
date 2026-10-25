// Raad's server settings that are not secrets. The owner's switches (pause,
// announcement) are Worker variables instead, so they change without a deploy.

/** The sites allowed to call Raad from a browser. */
export const SITE_ORIGINS = ['https://taleeb-portal.pages.dev'];

/** How Raad introduces himself to the systems he reads, so their IT can reach the owner instead of blocking him. */
export const USER_AGENT = 'TaleebPortal-Raad/1.0 (+https://t.me/ItsProf11)';
