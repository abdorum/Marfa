// Renders public/icons/icon.svg to the PNG icons (iOS needs PNG home-screen
// icons), in a headless Edge or Chrome. Change the logo in icon.svg, then run:
// npm run icons
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openBrowser } from './headless.mjs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'icons-'));
const browser = await openBrowser();

/** iOS rounds the corners itself, so its icon is full-bleed; so is the maskable one. */
async function icon(size, fullBleed) {
  const page = join(dir, `${size}.html`);
  writeFileSync(page, `<!doctype html><style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}${fullBleed ? '.tile{rx:0}' : ''}</style>${svg}`);
  writeFileSync(`public/icons/icon-${size}.png`, await browser.shoot(pathToFileURL(page).href, size, size, true));
}

await icon(180, true);
await icon(192, false);
await icon(512, true);
browser.close();
console.log('icons written to public/icons');
