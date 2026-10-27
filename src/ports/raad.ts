// What the app asks Raad's server besides data: whether he is working, and
// the owner's message to every student (Docs/خطة النسخة 1: أ7).
import type { Localized } from '../core/model';

export interface ServerStatus {
  /** Raad refuses syncs: the owner stopped him, or he is resting (`auto`). */
  paused: boolean;
  /** He rests on his own while the college struggles or refuses him, until `until`. */
  auto?: boolean;
  until?: string;
  /** Why, in the owner's words. */
  message?: Localized;
  /** An announcement shown to every student. */
  notice?: Localized;
  /** The owner's choice of how old data may get before devices refresh it (exam weeks). */
  staleMinutes?: number;
}

export interface RaadServer {
  status(): Promise<ServerStatus | undefined>;
  /** The student signed out: their pseudonym leaves the owner's statistics. Never fails, never waits. */
  forget?(userid: string): void;
  /** A student asks for a college not in the portal yet: its name, and the city and system address if known. */
  wish?(w: { name: string; city?: string; system?: string }): Promise<'sent' | 'busy' | 'failed'>;
}
