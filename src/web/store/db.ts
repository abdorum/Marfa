// Minimal IndexedDB key-value store. Falls back to memory when IndexedDB is
// unavailable (private mode), so the app still works for the session.

const DB = 'ties';
const STORE = 'kv';
const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | undefined> | undefined;

function open(): Promise<IDBDatabase | undefined> {
  dbPromise ??= new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(db => new Promise(resolve => {
    if (!db) return resolve(undefined);
    try {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  }));
}

export async function get<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  return (await tx<T>('readonly', s => s.get(key) as IDBRequest<T>)) ?? undefined;
}

export async function set(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  await tx('readwrite', s => s.put(value, key));
}

export async function del(key: string): Promise<void> {
  memory.delete(key);
  await tx('readwrite', s => s.delete(key));
}

export async function clearAll(): Promise<void> {
  memory.clear();
  await tx('readwrite', s => s.clear());
}
