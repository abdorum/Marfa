// The institution profile (Docs/17: ملف المؤسسة; ADR-021). Everything that
// differs from one institution to another lives here, never in the code.
import type { Localized, SourceId } from './model';

export interface InstitutionProfile {
  id: string;
  name: Required<Localized>;
  /** The adapter that reads this institution's data. */
  source: SourceId;
  /** The institution's own system: where students do what this product never does. */
  officialUrl?: string;
  /** Absence limit, percent of a course's classes. */
  absenceLimit: number;
  /** The GPA scale, when known (4 or 5). Unknown means the GPA shows alone. */
  gpaScale?: number;
  /** A term's usual length in weeks, used when the source gives no end date. */
  termWeeks: number;
  /** 0 = Sunday. */
  weekStart: number;
  /** Days without classes as a rule; shown only when a class falls on one. */
  weekend: readonly number[];
  timeZone: { id: string; offsetMinutes: number };
  /** Where Raad's server runs for this institution, for the student to know. */
  raadHome?: Required<Localized>;
}
