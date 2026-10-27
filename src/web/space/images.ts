// Pictures for «مساحتي», made smaller on the device before they are kept:
// nothing is uploaded, and a phone's 4 MB photo would weigh on the store.

/** Draws the file into at most `max` pixels a side (a centred square when `square`), as JPEG under `bytes`. */
export async function fitImage(file: Blob, o: { max: number; bytes: number; square?: boolean }): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return undefined;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { return undefined; }
  const side = o.square ? Math.min(bmp.width, bmp.height) : 0;
  const sw = o.square ? side : bmp.width;
  const sh = o.square ? side : bmp.height;
  const scale = Math.min(1, o.max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const g = canvas.getContext('2d');
  if (!g) return undefined;
  // A transparent picture gets a paper ground, not black.
  g.fillStyle = '#DAD5BF';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  bmp.close();
  for (const q of [0.86, 0.76, 0.64, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= o.bytes) return url;
  }
  return undefined;
}

/** A kept picture as a file to share. Decoded here, not fetched: the site's CSP allows no data: in connect-src. */
export function dataUrlFile(url: string, name: string): File {
  const [head = '', body = ''] = url.split(',');
  const type = /^data:([^;]+);base64$/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'image'}.jpg`, { type });
}
