// Where the app keeps things on the student's device.

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  /** Everything, at sign-out. */
  clear(): Promise<void>;
}

/** Encryption at rest for what is personal: the snapshot, and the password when remembered. */
export interface Sealer {
  seal(value: unknown): Promise<Sealed | undefined>;
  open<T>(sealed: Sealed | undefined): Promise<T | undefined>;
  /** Forget the key held in memory, after the store was cleared. */
  reset(): void;
}

export interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}
