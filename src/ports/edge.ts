// The port between Raad's server and a source that needs him (tier D,
// Docs/20-adapters.md): a connector signs in with the student's password,
// reads the allowed parts, signs out, and reports each step as it goes.
// Raad's server (raad/server) adds everything else: routing, protection,
// streaming. Connectors depend on this file only, never on the server.

/**
 * A failure a connector reports. BAD_CREDENTIALS is the one the server counts
 * against an ID, so a connector reports it only when the source said so plainly.
 */
export class EdgeError extends Error {
  constructor(public code: string, message: string = code) {
    super(message);
    this.name = 'EdgeError';
  }
}

/** One step as it happens, streamed to the student's device. `note`: a part name or an error code, never personal data. */
export interface ServerEvent {
  key: 'signin' | 'fetch' | 'signout';
  status: 'start' | 'ok' | 'fail';
  ms?: number;
  note?: string;
}

export interface ConnectorResult {
  pages: Record<string, string>;
  errors: Record<string, string>;
  log: { label: string; ok: boolean; ms: number; note?: string }[];
  fetchedAt: string;
}

export interface EdgeConnector {
  id: string;
  /** The parts a browser may ask for, by name. Nothing outside this list is ever fetched. */
  parts: readonly string[];
  sync(userid: string, pwd: string, parts: string[], emit: (e: ServerEvent) => void): Promise<ConnectorResult>;
  /** Can the server reach the source? Must not sign in. */
  health(): Promise<Record<string, unknown>>;
}

/** What the server gives every connector it hosts. */
export interface ConnectorEnv {
  /** How Raad introduces himself to the systems he reads. */
  userAgent: string;
}
