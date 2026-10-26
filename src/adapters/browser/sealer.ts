// Encryption at rest with WebCrypto: AES-GCM under a key the browser will not
// export, kept in the same store. It keeps the data unreadable to anything
// that reads plain storage; it does not protect an unlocked device in someone
// else's hands (Docs/09-security-privacy.md).
import type { KeyValueStore, Sealed, Sealer } from '../../ports/storage';

const KEY = 'sealer:key';

export function createSealer(store: KeyValueStore): Sealer {
  let cached: CryptoKey | undefined;
  let creating: Promise<CryptoKey> | undefined;

  const key = async (create: boolean): Promise<CryptoKey | undefined> => {
    if (cached) return cached;
    // A failed read throws (store.ts), so a new key is made only when there truly is none.
    const existing = await store.get<CryptoKey>(KEY);
    if (existing) return (cached = existing);
    if (!create) return undefined;
    creating ??= (async () => {
      const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await store.set(KEY, k);
      return k;
    })().finally(() => { creating = undefined; });
    return (cached = await creating);
  };

  return {
    async seal(value) {
      const k = await key(true);
      if (!k) return undefined;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(value)));
      return { iv, data };
    },
    async open<T>(sealed: Sealed | undefined) {
      if (!sealed?.iv || !sealed.data) return undefined;
      const k = await key(false);
      if (!k) return undefined;
      try {
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, k, sealed.data);
        return JSON.parse(new TextDecoder().decode(plain)) as T;
      } catch {
        return undefined;
      }
    },
    reset() {
      cached = undefined;
    },
  };
}

/** A stored value is sealed if it has the shape `seal` returns. */
export const isSealed = (v: unknown): v is Sealed =>
  !!v && typeof v === 'object' && (v as Sealed).iv instanceof Uint8Array && (v as Sealed).data instanceof ArrayBuffer;
