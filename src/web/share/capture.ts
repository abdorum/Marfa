// A card as a picture, made on the device (Docs/17: البطاقة). The card is
// copied into a branded frame off screen, personal details masked if the
// student asks, and drawn to a PNG. The drawing library loads only when a
// student shares.
import { PRODUCT } from '../../app/product';
import { dateLabel, dir, lang, strings } from '../i18n';

export interface CaptureOptions {
  /** Replace elements marked data-private (ID, email, phone). */
  mask: boolean;
}

function footer(): HTMLElement {
  const foot = document.createElement('div');
  foot.className = 'share-foot';
  const logo = document.createElement('img');
  logo.src = '/icons/icon.svg';
  logo.alt = '';
  const name = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = strings.value.appName;
  const date = document.createElement('span');
  date.textContent = dateLabel(new Date(), { day: 'numeric', month: 'long', year: 'numeric' });
  name.append(b, date);
  const site = document.createElement('span');
  site.className = 'site';
  site.textContent = new URL(PRODUCT.site).host;
  foot.append(logo, name, site);
  return foot;
}

/** The card's copy in its frame, attached off screen so it lays out like the original. */
function frame(card: HTMLElement, o: CaptureOptions): HTMLElement {
  const f = document.createElement('div');
  f.className = 'share-frame';
  f.dir = dir.value;
  f.lang = lang.value;
  const copy = card.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-noshare]').forEach(n => n.remove());
  if (o.mask) copy.querySelectorAll('[data-private]').forEach(n => { n.textContent = '••••••'; });
  f.append(copy, footer());
  document.body.append(f);
  return f;
}

export async function captureCard(card: HTMLElement, o: CaptureOptions): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot');
  const f = frame(card, o);
  try {
    await document.fonts?.ready;
    // Let the logo and pictures decode before drawing.
    await Promise.all([...f.querySelectorAll('img')].map(img => img.decode?.().catch(() => {})));
    const blob = await domToBlob(f, { scale: 3, type: 'image/png', timeout: 15000 });
    if (!blob?.size) throw new Error('EMPTY');
    return blob;
  } finally {
    f.remove();
  }
}

/** A file name for the picture: the product, the card and the date. */
export const fileName = (card: string) => `taleeb-${card}-${new Date().toISOString().slice(0, 10)}.png`;
