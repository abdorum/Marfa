// Dev only (`npm run dev`): a month of made-up statistics, so the owner's page
// (/admin/) has something to draw. Written through Raad's own code, never real.
import { count, countSync, flushCounts, pseudonym, seen, type Db } from '../../raad/server/stats';

const DAY_MS = 86_400_000;

export async function seedSampleStats(db: Db, now = Date.now()) {
  let x = 7;
  const random = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const ids = Array.from({ length: 64 }, (_, i) => String(2400000 + i * 37));
  for (let back = 29; back >= 0; back--) {
    const day = now - back * DAY_MS;
    const weekday = new Date(day).getUTCDay();
    const weekend = weekday === 5 || weekday === 6;
    // Word spreads: more students as the month goes on, fewer at the weekend.
    const reach = Math.min(ids.length, 8 + Math.round((29 - back) * 1.6));
    for (const id of ids.slice(0, reach)) {
      if (random() > (weekend ? 0.35 : 0.7)) continue;
      const hour = [7, 8, 8, 9, 10, 12, 13, 15, 19, 21, 22][Math.floor(random() * 11)]!;
      const t = day - (day % DAY_MS) + (hour - 3) * 3_600_000 + Math.floor(random() * 3_600_000);
      if (t > now) continue;
      await seen(db, await pseudonym(id, 'dev'), t);
      const roll = random();
      const code = roll < 0.86 ? 'OK' : roll < 0.93 ? 'PARTIAL' : roll < 0.96 ? 'TIMEOUT' : 'BAD_CREDENTIALS';
      countSync(db, undefined, code, 2500 + random() * 4000, code === 'PARTIAL' ? { attendance: 'TIMEOUT' } : {}, t);
      for (let k = 0; k < 1 + Math.floor(random() * 3); k++) count(db, undefined, 'open', back > 6 || random() < 0.2 ? 'unknown' : '1.3.0', 0, t);
    }
    if (back === 3) for (let k = 0; k < 4; k++) count(db, undefined, 'outcome', 'COOLDOWN', 0, day);
  }
  await flushCounts(db);
}
