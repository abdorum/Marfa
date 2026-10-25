// Raad's picture. A picture placed next to this file, named avatar.png (or
// .webp, .jpg, .avif), replaces the default at the next build: no code to
// change (README.md here). His words live with the UI strings.
import fallback from './avatar.svg?url';

const custom = import.meta.glob<string>('./avatar.{png,webp,jpg,jpeg,avif}', { eager: true, query: '?url', import: 'default' });

export const RAAD_AVATAR: string = Object.values(custom)[0] ?? fallback;
