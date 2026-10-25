// The device store: a minimal IndexedDB key-value store. Falls back to memory
// when IndexedDB is unavailable (private mode), so the app still works for
// the session.
import type { KeyValueStore } from '../../ports/storage';

const STORE = 'kv';

export function createDeviceStore(name = 'taleeb'): KeyValueStore {
  const memory = new Map<string, unknown>();
  let dbPromise: Promise<IDBDatabase | undefined> | undefined;

  const open = () => (dbPromise ??= new Promise(resolve => {
    try {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }));

  const tx = <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> =>
    open().then(db => new Promise(resolve => {
      if (!db) return resolve(undefined);
      try {
        const req = run(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    }));

  return {
    async get<T>(key: string) {
      if (memory.has(key)) return memory.get(key) as T;
      return (await tx<T>('readonly', s => s.get(key) as IDBRequest<T>)) ?? undefined;
    },
    async set(key, value) {
      memory.set(key, value);
      await tx('readwrite', s => s.put(value, key));
    },
    async del(key) {
      memory.delete(key);
      await tx('readwrite', s => s.delete(key));
    },
    async clear() {
      memory.clear();
      await tx('readwrite', s => s.clear());
    },
  };
}

/** Asks the browser not to evict the store under storage pressure (Safari's 7-day rule). */
export async function askPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false);
  } catch {
    return false;
  }
}
