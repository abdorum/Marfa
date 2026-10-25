// The product itself: one name in two languages, one version, one address.

export const PRODUCT = {
  name: { ar: 'بوابة معلومات الطالب', en: 'Taleeb Portal' },
  /** Where a few letters fit, like a home-screen icon. */
  shortName: { ar: 'بوابة الطالب', en: 'Taleeb' },
  version: __APP_VERSION__,
  site: 'https://taleeb-portal.pages.dev',
  contact: 'https://t.me/ItsProf11',
} as const;
