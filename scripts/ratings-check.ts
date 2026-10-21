// Comprueba el reparto de notas: media, goleadores, asistentes y defensas que encajan.
// Uso: npx vite-node scripts/ratings-check.ts
import seed from '../src/data/seed.json';
import { simulateMatch } from '../src/engine/match';
import { DEFAULT_SETTINGS, type PlayerLine, type Role, type SimTeam } from '../src/engine/types';

const byTeam = new Map<string, typeof seed.players>();
for (const p of seed.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
const sim = (id: string): SimTeam => {
  const t = seed.teams.find((x) => x.id === id)!;
  return { ...t, form: 0, penaltyTaker: t.penaltyTaker ?? undefined, players: byTeam.get(id)!.map((p) => ({ ...p, role: p.role as Role, form: 0 })) };
};
const teams = seed.teams.map((t) => sim(t.id));
const lines: { l: PlayerLine; lost: boolean; won: boolean }[] = [];
let seedN = 7;
for (let i = 0; i < 6000; i++) {
  const lg = seed.leagues[i % 6];
  const h = lg.teams[Math.floor(Math.random() * lg.teams.length)];
  let a = h;
  while (a === h) a = lg.teams[Math.floor(Math.random() * lg.teams.length)];
  const r = simulateMatch(teams.find((t) => t.id === h)!, teams.find((t) => t.id === a)!, DEFAULT_SETTINGS, {}, seedN++);
  for (const l of r.players) if (l.rating > 0 && l.starter) lines.push({ l, lost: r.score[l.side] < r.score[1 - l.side], won: r.score[l.side] > r.score[1 - l.side] });
}
const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)).toFixed(2);
const pct = (xs: unknown[], n: number) => `${((100 * xs.length) / Math.max(1, n)).toFixed(0)}%`;
const def = (l: PlayerLine) => l.role === 'CB' || l.role === 'LB' || l.role === 'RB';
console.log(`Media titulares: ${avg(lines.map((x) => x.l.rating))}   [objetivo ≈ 6,8]`);
for (const role of ['GK', 'CB', 'LB', 'DM', 'CM', 'AM', 'LW', 'ST'])
  console.log(`  ${role}: ${avg(lines.filter((x) => x.l.role === role).map((x) => x.l.rating))}`);
const scorers = lines.filter((x) => x.l.goals > 0);
const notScorers = lines.filter((x) => x.l.goals === 0 && !def(x.l) && x.l.role !== 'GK');
console.log(`Marcan: media ${avg(scorers.map((x) => x.l.rating))} · ≥7,0 en ${pct(scorers.filter((x) => x.l.rating >= 7), scorers.length)} (atacantes sin gol: ${avg(notScorers.map((x) => x.l.rating))})`);
const assisters = lines.filter((x) => x.l.assists > 0 && x.l.goals === 0);
console.log(`Asisten (sin marcar): media ${avg(assisters.map((x) => x.l.rating))} · ≥7,0 en ${pct(assisters.filter((x) => x.l.rating >= 7), assisters.length)}`);
for (const n of [0, 1, 2, 3]) {
  const d = lines.filter((x) => def(x.l) && x.l.minutes >= 80 && (n === 3 ? x.l.conceded >= 3 : x.l.conceded === n));
  console.log(`Defensas que encajan ${n === 3 ? '3+' : n}: media ${avg(d.map((x) => x.l.rating))} · por debajo de 6,0 en ${pct(d.filter((x) => x.l.rating < 6), d.length)}`);
}
const beaten = lines.filter((x) => def(x.l) && x.lost && x.l.minutes >= 80 && x.l.conceded >= 2);
const saved = beaten.filter((x) => x.l.rating >= 6);
console.log(`Defensas en derrotas encajando 2+: media ${avg(beaten.map((x) => x.l.rating))} · aprueban (≥6,0) ${pct(saved, beaten.length)} — esos hicieron ${avg(saved.map((x) => x.l.defActions))} cortes y ${avg(saved.map((x) => x.l.blocks))} bloqueos (resto: ${avg(beaten.filter((x) => x.l.rating < 6).map((x) => x.l.defActions))} cortes)`);
