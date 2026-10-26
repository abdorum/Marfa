// The contract every data source implements (Docs/20-adapters.md). The app
// talks to this interface only, so a source can be swapped for another (a
// file, an official API) without touching a single card.
import type { AttemptContext } from '../core/attempt';
import type { DataArea, SourceId, SyncResult } from '../core/model';

/** Risk tier (Docs/20): A files, B official APIs, C a bridge the institution hosts, D reading pages with the student's password. */
export type AdapterTier = 'A' | 'B' | 'C' | 'D';

/** What an adapter declares about itself (ADR-022). The UI hides what it does not provide. */
export interface AdapterManifest {
  id: SourceId;
  /** The source it reads, as people know it. */
  reads: string;
  tier: AdapterTier;
  provides: readonly DataArea[];
  credentials: 'none' | 'token' | 'password';
  maintainer: string;
  /** Always true: no adapter writes to a source (ADR-020). */
  readOnly: true;
}

export interface Credentials {
  userid: string;
  pwd: string;
}

export interface SourceContext extends AttemptContext {
  credentials?: Credentials;
  /** The areas worth reading now; undefined means all. A source may read more, never less. */
  areas?: readonly DataArea[];
}

export interface StudentDataSource {
  manifest: AdapterManifest;
  /** One attempt at reading everything. Throws RaadError; Raad decides about retrying. */
  sync(ctx: SourceContext): Promise<SyncResult>;
}
