// «مساحتي»: the student's own corner, not the college's. Their picture and
// their kit (العُدّة): links, notes, pictures and countdowns they reach for
// often. Nothing here leaves the device: it is sealed in the device store
// beside the snapshot, and goes with it at sign-out. A backup file is the
// one way to carry it to another device.
import type { KeyValueStore, Sealed, Sealer } from '../ports/storage';

export type KitKind = 'link' | 'text' | 'image' | 'countdown';
export const KIT_KINDS: readonly KitKind[] = ['link', 'text', 'image', 'countdown'];

export interface KitItem {
  id: string;
  kind: KitKind;
  name: string;
  /** A web address, a note, a picture as a data URL, or the moment a countdown ends (ISO). */
  value: string;
  createdAt: string;
}

export interface SpaceData {
  /** The student's own picture, as a data URL; none means the default one. */
  photo?: string;
  kit: KitItem[];
}

export const KIT_MAX = 12;
export const NAME_MAX = 40;
export const TEXT_MAX = 1000;
/** A picture is made smaller on the device before it is kept (src/web/space/images.ts). */
const IMAGE_MAX = 1_500_000;
const PHOTO_MAX = 400_000;
const KEY = 'space';
const BACKUP = 'taleeb-space';

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isImage = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max && /^data:image\/(jpeg|webp|png);base64,[a-z0-9+/=]+$/i.test(s);

/** Only web addresses open from the kit: a bare address gets https, anything else is refused. */
export function webAddress(raw: string): string | undefined {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** A kit item as the student entered it (or a backup holds it), checked; undefined if it is not one. */
export function parseItem(x: unknown, id: string, createdAt: string): KitItem | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  const kind = KIT_KINDS.find(k => k === o.kind);
  const name = clean(o.name, NAME_MAX);
  if (!kind || !name) return undefined;
  let value: string | undefined;
  if (kind === 'link') value = webAddress(typeof o.value === 'string' ? o.value : '');
  else if (kind === 'text') value = typeof o.value === 'string' ? o.value.trim().slice(0, TEXT_MAX) || undefined : undefined;
  else if (kind === 'image') value = isImage(o.value, IMAGE_MAX) ? o.value : undefined;
  else {
    const t = typeof o.value === 'string' ? Date.parse(o.value) : NaN;
    value = Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  }
  return value ? { id, kind, name, value, createdAt } : undefined;
}

export interface SpaceDeps {
  store: KeyValueStore;
  sealer: Sealer;
  now(): Date;
  id(): string;
}

export interface Space {
  readonly data: SpaceData;
  subscribe(fn: (d: SpaceData) => void): () => void;
  load(): Promise<void>;
  add(item: { kind: KitKind; name: string; value: string }): Promise<KitItem | undefined>;
  remove(id: string): Promise<void>;
  setPhoto(photo: string | undefined): Promise<boolean>;
  /** The backup file's text: plain JSON, not sealed, for the student to keep. */
  backup(): string;
  /** Replaces the kit and picture with a backup's; the count of items taken, or undefined if it is not one. */
  restore(text: string): Promise<number | undefined>;
  /** After sign-out cleared the store. */
  forget(): void;
}

export function createSpace(d: SpaceDeps): Space {
  let data: SpaceData = { kit: [] };
  const listeners = new Set<(d: SpaceData) => void>();
  const set = async (next: SpaceData) => {
    data = next;
    for (const l of listeners) l(data);
    await d.store.set(KEY, await d.sealer.seal(data));
  };

  return {
    get data() { return data; },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async load() {
      const kept = await d.sealer.open<SpaceData>(await d.store.get<Sealed>(KEY)).catch(() => undefined);
      if (!kept) return;
      data = { photo: isImage(kept.photo, PHOTO_MAX) ? kept.photo : undefined, kit: (kept.kit ?? []).filter(i => parseItem(i, i.id, i.createdAt)).slice(0, KIT_MAX) };
      for (const l of listeners) l(data);
    },

    async add(raw) {
      if (data.kit.length >= KIT_MAX) return undefined;
      const item = parseItem(raw, d.id(), d.now().toISOString());
      if (item) await set({ ...data, kit: [...data.kit, item] });
      return item;
    },

    async remove(id) {
      await set({ ...data, kit: data.kit.filter(i => i.id !== id) });
    },

    async setPhoto(photo) {
      if (photo !== undefined && !isImage(photo, PHOTO_MAX)) return false;
      await set({ ...data, photo });
      return true;
    },

    backup: () => JSON.stringify({ app: BACKUP, version: 1, at: d.now().toISOString(), ...data }),

    async restore(text) {
      let o: Record<string, unknown>;
      try { o = JSON.parse(text); } catch { return undefined; }
      if (!o || o.app !== BACKUP || !Array.isArray(o.kit)) return undefined;
      const at = d.now().toISOString();
      const kit = o.kit.map(i => parseItem(i, d.id(), at)).filter((i): i is KitItem => !!i).slice(0, KIT_MAX);
      await set({ photo: isImage(o.photo, PHOTO_MAX) ? o.photo : data.photo, kit });
      return kit.length;
    },

    forget() {
      data = { kit: [] };
      for (const l of listeners) l(data);
    },
  };
}
