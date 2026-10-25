// Share a card: preview the picture first, choose whether to hide personal
// details, then share, save or copy it. Nothing leaves the device unless the
// student sends it.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { Copy, Download, Share2 } from 'lucide-preact';
import { strings } from '../i18n';
import { Sheet, Spinner, toast } from '../ui';
import { captureCard, fileName } from './capture';

interface Target {
  el: HTMLElement;
  id: string;
  title: string;
  /** The card shows personal details (data-private) that can be hidden. */
  personal: boolean;
}

export const shareTarget = signal<Target | undefined>(undefined);

export function openShare(el: HTMLElement, id: string, title: string) {
  shareTarget.value = { el, id, title, personal: !!el.querySelector('[data-private]') };
}

export function ShareSheet() {
  const target = shareTarget.value;
  if (!target) return null;
  return <SheetFor key={target.id} target={target} onClose={() => { shareTarget.value = undefined; }} />;
}

function SheetFor({ target, onClose }: { target: Target; onClose: () => void }) {
  const t = strings.value.share;
  const [mask, setMask] = useState(true);
  const [blob, setBlob] = useState<Blob>();
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let made: string | undefined;
    setBlob(undefined);
    setFailed(false);
    captureCard(target.el, { mask }).then(b => {
      if (!live) return;
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
    }, () => live && setFailed(true));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [target, mask]);

  const file = blob && new File([blob], fileName(target.id), { type: 'image/png' });
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const canCopy = !!blob && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

  const save = () => {
    if (!url || !file) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  };

  return (
    <Sheet title={t.title} onClose={onClose}>
      <div class="share-preview" aria-live="polite">
        {url && blob ? <img src={url} alt={target.title} /> : failed ? <p class="empty">{t.failed}</p> : <span class="row-flex muted"><Spinner />{t.preparing}</span>}
      </div>
      {target.personal && (
        <label class="setting">
          <span>{t.mask}<small>{t.maskHint}</small></span>
          <input class="toggle" type="checkbox" checked={mask} onChange={e => setMask(e.currentTarget.checked)} />
        </label>
      )}
      <div class="share-actions">
        {canShare && (
          <button class="btn primary" disabled={!file} onClick={() => {
            // Called straight from the tap: Safari allows sharing only then.
            navigator.share({ files: [file!], title: target.title }).catch(() => {});
          }}><Share2 />{t.share}</button>
        )}
        <button class={`btn ${canShare ? 'soft' : 'primary'}`} disabled={!blob} onClick={save}><Download />{t.save}</button>
        {canCopy && (
          <button class="btn soft" disabled={!blob} onClick={() => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]).then(() => toast(t.copied), () => {});
          }}><Copy />{t.copy}</button>
        )}
      </div>
    </Sheet>
  );
}
