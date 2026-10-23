// Lists the images in public/avatars/ into public/avatars.json, so adding a
// picture needs no code change. Runs before `dev` and `build`.
import { readdir, writeFile } from 'node:fs/promises';

const dir = new URL('../public/avatars/', import.meta.url);
const files = (await readdir(dir)).filter(f => /\.(svg|jpe?g|png|webp)$/i.test(f)).sort();
await writeFile(new URL('../public/avatars.json', import.meta.url), JSON.stringify(files.map(f => `/avatars/${f}`)) + '\n');
console.log(`avatars.json: ${files.length} image(s)`);
