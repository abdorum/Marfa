// The adapters this build carries, by id (Docs/20-adapters.md). The
// institution profile names which one serves its students; the demo serves
// anyone who wants a look without an account.
import type { InstitutionProfile } from '../../core/institution';
import type { AdapterManifest, StudentDataSource } from '../../ports/source';
import { createDemoSource, DEMO_MANIFEST } from './demo/source';
import { OFFICIAL_MANIFEST } from './official/source';
import { createPeopleSoftSource, PEOPLESOFT_MANIFEST, type PeopleSoftSourceOptions } from './peoplesoft/client';

export interface SourceOptions {
  institution: InstitutionProfile;
  /** Dev only (PeopleSoft): receives raw pages to save anonymized fixtures. */
  onRaw?: PeopleSoftSourceOptions['onRaw'];
}

export const MANIFESTS: readonly AdapterManifest[] = [PEOPLESOFT_MANIFEST, OFFICIAL_MANIFEST, DEMO_MANIFEST];

const FACTORIES: Record<string, (o: SourceOptions) => StudentDataSource> = {
  peoplesoft: o => createPeopleSoftSource({ institution: o.institution.name.en, onRaw: o.onRaw }),
  demo: () => createDemoSource(),
};

export function createSource(id: string, o: SourceOptions): StudentDataSource {
  const make = FACTORIES[id];
  if (!make) throw new Error(`No adapter "${id}" in this build`);
  return make(o);
}

export { demoHistory } from './demo/source';
