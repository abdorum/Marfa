import { LEGAL, UPDATED } from '../i18n/legal';
import { lang, strings } from '../i18n';
import { signedIn } from '../store/app';
import { Link, TopBar } from '../ui';

/** Privacy policy and terms. Reachable before signing in, from the sign-in screen. */
export function Legal({ doc }: { doc: 'privacy' | 'terms' }) {
  const d = LEGAL[doc][lang.value];
  const t = strings.value;
  const home = signedIn.value ? '/me/about' : '/';
  return (
    <>
      <TopBar backTo={home} crumb={signedIn.value ? <Link href={home}>{t.about.title}</Link> : undefined} title={d.title} end={signedIn.value ? undefined : <span />} />
      <div class="page">
        <div class="card stack legal">
          {d.sections.map(s => (
            <section>
              <h2>{s.h}</h2>
              {s.p.map(p => <p>{p}</p>)}
            </section>
          ))}
          <p class="label"><bdi>{UPDATED}</bdi></p>
        </div>
      </div>
    </>
  );
}
