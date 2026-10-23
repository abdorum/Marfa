// Credentials at rest, only when the student chose "remember me": AES-GCM
// with a non-extractable WebCrypto key kept in IndexedDB. This protects
// against copying browser files or reading plain storage; it does not protect
// an unlocked device in someone else's hands (Docs/09-security-privacy.md).
import type { Credentials } from '../../adapters/ports';
import * as db from './db';

const KEY = 'vault:key';
const BLOB = 'vault:blob';

async function key(create: boolean): Promise<CryptoKey | undefined> {
  const existing = await db.get<CryptoKey>(KEY);
  if (existing || !create) return existing;
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await db.set(KEY, k);
  return k;
}

export async function save(c: Credentials): Promise<void> {
  const k = await key(true);
  if (!k) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(c)));
  await db.set(BLOB, { iv, data });
}

export async function load(): Promise<Credentials | undefined> {
  const k = await key(false);
  const blob = await db.get<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }>(BLOB);
  if (!k || !blob) return undefined;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.iv }, k, blob.data);
    return JSON.parse(new TextDecoder().decode(plain)) as Credentials;
  } catch {
    return undefined;
  }
}

export async function forget(): Promise<void> {
  await db.del(BLOB);
  await db.del(KEY);
}
