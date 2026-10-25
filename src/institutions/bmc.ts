// Batterjee Medical College, Jeddah: the first institution (ADR-021).
import type { InstitutionProfile } from '../core/institution';

export const BMC: InstitutionProfile = {
  id: 'bmc',
  name: { ar: 'كلية البترجي الطبية', en: 'Batterjee Medical College' },
  source: 'peoplesoft',
  officialUrl: 'https://sis.bmc.edu.sa',
  absenceLimit: 25,
  // Not confirmed yet: until it is, the GPA is shown without a scale.
  gpaScale: undefined,
  // The college system gives no term end; a semester is about 16 weeks.
  termWeeks: 16,
  weekStart: 0,
  weekend: [5, 6],
  timeZone: { id: 'Asia/Riyadh', offsetMinutes: 180 },
  raadHome: { ar: 'أمستردام، بجوار خوادم الكلية', en: 'Amsterdam, next to the college servers' },
};
