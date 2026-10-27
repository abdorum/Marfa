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
  raadHome: { ar: 'أمستردام، هولندا', en: 'Amsterdam, the Netherlands' },
  // The attendance page is the college's own (Docs/10-peoplesoft-notes.md).
  peoplesoft: { base: 'https://sis.bmc.edu.sa', site: 'hp', pages: ['center', 'grades', 'attendance', 'exams'] },
};
