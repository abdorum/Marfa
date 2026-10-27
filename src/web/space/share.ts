// Sharing a kit item as what it is: a note as text with its name, a link as a
// link, a picture as a picture, a countdown as the moment it ends. Through the
// phone's own share sheet when there is one; otherwise copied, or saved.
import type { KitItem } from '../../app/space';
import { dateLabel, strings, time } from '../i18n';
import { toast } from '../ui';
import { dataUrlFile } from './images';

/** "الاثنين 2 نوفمبر 2026، 11:59 م" */
export function endLabel(iso: string): string {
  const d = new Date(iso);
  return `${dateLabel(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}، ${time(d.getHours() * 60 + d.getMinutes())}`;
}

export function shareText(item: KitItem): string {
  if (item.kind === 'countdown') return `${item.name}: ${endLabel(item.value)}`;
  return `${item.name}\n${item.value}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(strings.value.space.copied);
  } catch { /* no clipboard: nothing more to do */ }
}

export async function shareItem(item: KitItem): Promise<void> {
  try {
    if (item.kind === 'image') {
      const file = await dataUrlFile(item.value, item.name);
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: item.name });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      return;
    }
    const data: ShareData = item.kind === 'link' ? { title: item.name, url: item.value } : { title: item.name, text: shareText(item) };
    if (navigator.share && navigator.canShare?.(data) !== false) return await navigator.share(data);
    await copy(shareText(item));
  } catch (e) {
    // The student closed the share sheet: that is not a failure.
    if ((e as Error)?.name !== 'AbortError' && item.kind !== 'image') await copy(shareText(item));
  }
}
