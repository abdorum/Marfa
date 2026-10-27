// The card: the product's unit (Docs/17: البطاقة). Every section of the app
// is one, every one can be shared as a picture, and the home board is made of
// them like widgets.
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { Share2 } from 'lucide-preact';
import { strings } from '../i18n';
import { openShare } from '../share/ShareSheet';

export type CardTone = 'paper' | 'night' | 'glass';

export interface CardProps {
  /** Stable id: names the shared picture and the home board's choices. */
  id: string;
  title: ComponentChildren;
  /** Its number on the board, shown as a small HUD label. */
  index?: number;
  tone?: CardTone;
  /** Viewfinder corners (night cards). */
  hud?: boolean;
  /** Extra controls in the header, before the share button. */
  actions?: ComponentChildren;
  share?: boolean;
  class?: string;
  style?: Record<string, string | number>;
  children: ComponentChildren;
}

export function Card({ id, title, index, tone = 'paper', hud, actions, share = true, class: cls = '', style, children }: CardProps) {
  const ref = useRef<HTMLElement>(null);
  const label = typeof title === 'string' ? title : id;
  return (
    <section ref={ref} class={`card ${tone === 'paper' ? '' : tone} ${hud ? 'hud' : ''} ${cls}`} data-card={id} aria-label={label} style={style}>
      <header class="card-head">
        {index != null && <span class="idx" aria-hidden="true">{String(index).padStart(2, '0')}</span>}
        <h2>{title}</h2>
        {actions}
        {share && (
          <button class="card-act" data-noshare aria-label={`${strings.value.card.share}: ${label}`} onClick={() => ref.current && openShare(ref.current, id, label)}>
            <Share2 aria-hidden="true" />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
