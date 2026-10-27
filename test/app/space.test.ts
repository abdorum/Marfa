// «مساحتي»: the kit keeps only what it can open safely, sealed on the device,
// and a backup carries it to another device.
import { describe, expect, it } from 'vitest';
import { createSealer, isSealed } from '../../src/adapters/browser/sealer';
import { createSpace, KIT_MAX, parseItem, webAddress } from '../../src/app/space';
import type { KeyValueStore } from '../../src/ports/storage';

const NOW = new Date('2026-10-27T09:00:00Z');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function memoryStore(): KeyValueStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T>(k: string) => map.get(k) as T | undefined,
    set: async (k, v) => { map.set(k, v); },
    del: async k => { map.delete(k); },
    clear: async () => { map.clear(); },
  };
}

function setup(store = memoryStore()) {
  let n = 0;
  const space = createSpace({ store, sealer: createSealer(store), now: () => NOW, id: () => `i${++n}` });
  return { space, store };
}

describe('what the kit takes', () => {
  it('opens only web addresses', () => {
    expect(webAddress('example.edu/calendar')).toBe('https://example.edu/calendar');
    expect(webAddress('http://example.edu')).toBe('http://example.edu/');
    expect(webAddress('javascript:alert(1)')).toBeUndefined();
    expect(webAddress('data:text/html,x')).toBeUndefined();
    expect(webAddress('not a link')).toBeUndefined();
    expect(webAddress('localhost')).toBeUndefined();
  });

  it('checks every kind, and cleans the name', () => {
    const at = NOW.toISOString();
    expect(parseItem({ kind: 'text', name: '  مكتب‮ الإرشاد ', value: 'الدور 2' }, 'a', at)).toMatchObject({ name: 'مكتب الإرشاد', value: 'الدور 2' });
    expect(parseItem({ kind: 'countdown', name: 'تسليم البحث', value: '2026-11-02T20:59:00Z' }, 'a', at)?.value).toBe('2026-11-02T20:59:00.000Z');
    expect(parseItem({ kind: 'countdown', name: 'x', value: 'soon' }, 'a', at)).toBeUndefined();
    expect(parseItem({ kind: 'image', name: 'جدول', value: PNG }, 'a', at)).toBeDefined();
    expect(parseItem({ kind: 'image', name: 'جدول', value: 'https://example.edu/x.png' }, 'a', at)).toBeUndefined();
    expect(parseItem({ kind: 'script', name: 'x', value: 'y' }, 'a', at)).toBeUndefined();
    expect(parseItem({ kind: 'text', name: '   ', value: 'y' }, 'a', at)).toBeUndefined();
  });
});

describe('the kit', () => {
  it('is sealed on the device and comes back on the next opening', async () => {
    const { space, store } = setup();
    await space.add({ kind: 'link', name: 'التقويم الأكاديمي', value: 'example.edu/calendar' });
    await space.setPhoto(PNG);
    expect(isSealed(store.map.get('space'))).toBe(true);
    expect(JSON.stringify([...store.map.values()])).not.toContain('example.edu');

    const again = setup(store).space;
    await again.load();
    expect(again.data).toMatchObject({ photo: PNG, kit: [{ name: 'التقويم الأكاديمي', value: 'https://example.edu/calendar' }] });
  });

  it('holds twelve at most, and an item is removed by its id', async () => {
    const { space } = setup();
    for (let i = 0; i < KIT_MAX + 2; i++) await space.add({ kind: 'text', name: `n${i}`, value: 'v' });
    expect(space.data.kit).toHaveLength(KIT_MAX);
    await space.remove(space.data.kit[0]!.id);
    expect(space.data.kit).toHaveLength(KIT_MAX - 1);
  });

  it('refuses a picture that is not one', async () => {
    const { space } = setup();
    expect(await space.setPhoto('https://example.edu/me.jpg')).toBe(false);
    expect(space.data.photo).toBeUndefined();
  });

  it('a backup restores on another device, and anything else is refused', async () => {
    const { space } = setup();
    await space.add({ kind: 'countdown', name: 'تسليم البحث', value: '2026-11-02T20:59:00Z' });
    await space.add({ kind: 'text', name: 'مكتب الإرشاد', value: 'الدور 2' });
    const file = space.backup();

    const other = setup().space;
    expect(await other.restore('{"kit":[]}')).toBeUndefined();
    expect(await other.restore('not json')).toBeUndefined();
    const tampered = JSON.parse(file);
    tampered.kit.push({ kind: 'link', name: 'x', value: 'javascript:alert(1)' });
    expect(await other.restore(JSON.stringify(tampered))).toBe(2);
    expect(other.data.kit.map(i => i.name)).toEqual(['تسليم البحث', 'مكتب الإرشاد']);
  });

  it('is forgotten with the rest at sign-out', async () => {
    const { space, store } = setup();
    await space.add({ kind: 'text', name: 'n', value: 'v' });
    await store.clear();
    space.forget();
    expect(space.data.kit).toEqual([]);
    const again = setup(store).space;
    await again.load();
    expect(again.data.kit).toEqual([]);
  });
});
