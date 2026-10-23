// Dev only: strips personal data from captured PeopleSoft pages before they
// become test fixtures. Fixtures are committed to a public repository, so the
// capture tool refuses to write a page that still contains any secret.

export interface Secret {
  value: string;
  replacement: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces every secret (longest first, case-insensitive, whole words only so
 * a name part like "Ali" does not break "align") and session tokens.
 */
export function anonymize(html: string, secrets: Secret[]): string {
  let out = html;
  for (const { value, replacement } of [...secrets].sort((a, b) => b.value.length - a.value.length)) {
    if (value.trim().length < 2) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(value.trim())}(?![\\p{L}\\p{N}])`, 'giu'), replacement);
  }
  return out
    .replace(/(name=['"]?ICSID['"]?[^>]*value=['"])[^'"]*/gi, '$1REDACTED')
    .replace(/(name=['"]?ICStateNum['"]?[^>]*value=['"])[^'"]*/gi, '$11')
    .replace(/(name=['"]?lcsrf_token['"]?[^>]*value=['"])[^'"]*/gi, '$1REDACTED');
}

/** Returns the secrets still present in the text (should be empty). */
export function leaks(html: string, secrets: Secret[]): string[] {
  return secrets.map(s => s.value.trim())
    .filter(v => v.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${escape(v)}(?![\\p{L}\\p{N}])`, 'iu').test(html));
}

/**
 * The secrets for one student: full names, each name part, email and ID.
 * Name parts are replaced too, because pages show them on their own
 * ("<first name>'s Student Center").
 */
export function secretsFor(p: { userid: string; nameAr?: string; nameEn?: string; email?: string; phone?: string; firstName?: string }): Secret[] {
  const out: Secret[] = [{ value: p.userid, replacement: '20000000' }];
  if (p.email) out.push({ value: p.email, replacement: 'student@example.com' });
  if (p.phone) out.push({ value: p.phone, replacement: '0500000000' });
  const names = [
    { full: p.nameAr, fake: 'أحمد صالح العتيبي', parts: ['أحمد', 'صالح', 'العتيبي'] },
    { full: p.nameEn, fake: 'Ahmed Saleh Alotaibi', parts: ['Ahmed', 'Saleh', 'Alotaibi'] },
  ];
  for (const n of names) {
    if (!n.full) continue;
    out.push({ value: n.full, replacement: n.fake });
    n.full.split(/\s+/).filter(w => w.length >= 3).forEach((w, i) => out.push({ value: w, replacement: n.parts[Math.min(i, n.parts.length - 1)]! }));
  }
  if (p.firstName) out.push({ value: p.firstName, replacement: /[؀-ۿ]/.test(p.firstName) ? 'أحمد' : 'Ahmed' });
  // Same value can appear twice (first name is also a name part); keep one.
  return out.filter((s, i) => out.findIndex(o => o.value === s.value) === i);
}
