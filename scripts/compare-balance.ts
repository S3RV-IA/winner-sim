// Compara las probabilidades de victoria/empate/derrota entre la versión anterior de los datos y la actual.
// Uso: npx vite-node scripts/compare-balance.ts <seed-antiguo.json>
import { readFileSync } from 'node:fs';
import seed from '../src/data/seed.json';
import { DEFAULT_SETTINGS } from '../src/engine/types';
import { expectedGoals, outcomeOdds } from '../src/engine/strength';

type T = { id: string; short: string; att: number; ctl: number; def: number; momentum?: number };
const old = JSON.parse(readFileSync(process.argv[2], 'utf8')) as typeof seed;
const eff = (t: T) => ({ att: t.att + (t.momentum ?? 0), ctl: t.ctl + (t.momentum ?? 0), def: t.def + (t.momentum ?? 0) });
const odds = (h: T, a: T) => outcomeOdds(expectedGoals(eff(h), eff(a), DEFAULT_SETTINGS));
const byId = (s: typeof seed, id: string) => s.teams.find((t) => t.id === id) as T;

let n = 0, sum = 0, max = 0, worst = '';
const pairs: [string, string][] = [];
for (const lg of seed.leagues) for (const h of lg.teams) for (const a of lg.teams) if (h !== a) pairs.push([h, a]);
const top = ['esp-rma', 'esp-bar', 'ger-mun', 'eng-ars', 'eng-mci', 'eng-liv', 'fra-psg', 'ita-int', 'por-por', 'por-ben'];
for (const h of top) for (const a of top) if (h !== a) pairs.push([h, a]);
for (const [h, a] of pairs) {
  const o = odds(byId(old, h), byId(old, a));
  const nw = odds(byId(seed, h), byId(seed, a));
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(o[i] - nw[i]);
    sum += d;
    n++;
    if (d > max) [max, worst] = [d, `${byId(seed, h).short}-${byId(seed, a).short}`];
  }
}
console.log(`${pairs.length} enfrentamientos · diferencia media ${(100 * sum / n).toFixed(2)} puntos % · máxima ${(100 * max).toFixed(1)} (${worst})`);
const show = (h: string, a: string) => {
  const o = odds(byId(old, h), byId(old, a)).map((x) => Math.round(x * 100));
  const nw = odds(byId(seed, h), byId(seed, a)).map((x) => Math.round(x * 100));
  console.log(`  ${byId(seed, h).short} – ${byId(seed, a).short}: antes ${o.join('/')} · ahora ${nw.join('/')}`);
};
show('esp-rma', 'esp-mal');
show('esp-rma', 'esp-bar');
show('esp-ath', 'esp-vil');
show('eng-mun', 'eng-mci');
show('eng-liv', 'eng-ars');
show('ger-mun', 'ger-dor');
show('esp-rma', 'eng-mci');
