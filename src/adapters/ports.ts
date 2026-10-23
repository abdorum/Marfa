// The contracts every data source implements (Docs/05-architecture.md).
// The app talks to these interfaces only, so PeopleSoft can later be
// replaced by an official source without touching any screen.
import type { AttemptContext } from '../core/bot/types';
import type { SourceId, SyncResult } from '../core/model';

export interface Credentials {
  userid: string;
  pwd: string;
}

export interface SourceContext extends AttemptContext {
  credentials?: Credentials;
}

export interface StudentDataSource {
  id: SourceId;
  /** One attempt at reading everything. Throws RaadError; Raad decides about retrying. */
  sync(ctx: SourceContext): Promise<SyncResult>;
}
