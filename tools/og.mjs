// Draws the link preview: tools/og.html → public/og.png (1200×630), in a
// headless Edge or Chrome. Usage: node tools/og.mjs [path-to-browser]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openBrowser } from './headless.mjs';

const browser = await openBrowser();
writeFileSync('public/og.png', await browser.shoot(pathToFileURL(resolve('tools/og.html')).href, 1200, 630));
console.log('public/og.png written');
browser.close();
