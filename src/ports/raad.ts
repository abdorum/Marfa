// What the app asks Raad's server besides data: whether he is working, and
// the owner's message to every student (Docs/خطة النسخة 1: أ7).
import type { Localized } from '../core/model';

export interface ServerStatus {
  /** The owner stopped Raad for everyone; syncs are refused until resumed. */
  paused: boolean;
  /** Why, in the owner's words. */
  message?: Localized;
  /** An announcement shown to every student. */
  notice?: Localized;
}

export interface RaadServer {
  status(): Promise<ServerStatus | undefined>;
}
