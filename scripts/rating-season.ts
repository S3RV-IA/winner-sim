// Notas medias por temporada: goleadores, asistentes y jugadores normales. Uso: npx vite-node scripts/rating-season.ts
import seed from '../src/data/seed.json';
import { simulateMatch } from '../src/engine/match';
import { Rng } from '../src/engine/rng';
import { DEFAULT_SETTINGS, type Role, type SimTeam } from '../src/engine/types';
import { doubleRoundRobin } from '../src/game/schedule';

const byTeam = new Map<string, typeof seed.players>();
for (const p of seed.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
const sim = (id: string): SimTeam => {
  const t = seed.teams.find((x) => x.id === id)!;
  const m = t.momentum ?? 0;
  return { ...t, att: t.att + m, ctl: t.ctl + m, def: t.def + m, form: 0, penaltyTaker: t.penaltyTaker ?? undefined, players: byTeam.get(id)!.map((p) => ({ ...p, role: p.role as Role, form: 0 })) };
};
type Agg = { apps: number; goals: number; assists: number; dribbles: number; sum: number; role: string; name: string };
const seasons: Map<string, Agg>[] = [];
let n = 1;
const ALL: { rating: number; role: string; goals: number; assists: number; conceded: number; lost: boolean }[] = [];
const ALL_ELITE: { rating: number; goals: number }[] = [];
const ELITE_IDS = new Set(seed.players.filter((p) => p.role === 'ST' && p.fin >= 88).map((p) => p.id));
for (let s = 0; s < 4; s++)
  for (const lg of seed.leagues) {
    const agg = new Map<string, Agg>();
    for (const round of doubleRoundRobin(lg.teams, new Rng(s * 31 + 7)))
      for (const [h, a] of round) {
        const r = simulateMatch(sim(h), sim(a), DEFAULT_SETTINGS, {}, n++);
        for (const l of r.players) {
          if (!l.rating) continue;
          if (l.starter && ELITE_IDS.has(l.id)) ALL_ELITE.push({ rating: l.rating, goals: l.goals });
          if (l.starter) ALL.push({ rating: l.rating, role: l.role, goals: l.goals, assists: l.assists, conceded: l.conceded, lost: r.score[l.side] < r.score[1 - l.side] });
          const p = agg.get(l.id) ?? { apps: 0, goals: 0, assists: 0, dribbles: 0, sum: 0, role: l.role, name: seed.players.find((x) => x.id === l.id)!.name };
          p.apps++;
          p.goals += l.goals;
          p.assists += l.assists;
          p.dribbles += l.dribbles;
          p.sum += l.rating;
          agg.set(l.id, p);
        }
      }
    seasons.push(agg);
  }
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(2);
console.log(`Media titulares ${avg(ALL.map((x) => x.rating))} · sin gol ni asistencia ${avg(ALL.filter((x) => !x.goals && !x.assists).map((x) => x.rating))}`);
const oneGoal = ALL.filter((x) => x.goals === 1 && !x.assists);
console.log(`1 gol sin más: <8 en ${Math.round((100 * oneGoal.filter((x) => x.rating < 8).length) / oneGoal.length)}% · ≥9 en ${Math.round((100 * oneGoal.filter((x) => x.rating >= 9).length) / oneGoal.length)}% · gol+asist ${avg(ALL.filter((x) => x.goals === 1 && x.assists === 1).map((x) => x.rating))} · 2 asist ${avg(ALL.filter((x) => x.assists === 2 && !x.goals).map((x) => x.rating))} · dieces ${(100 * ALL.filter((x) => x.rating >= 10).length / ALL.length).toFixed(2)}% de las notas`);
console.log(`Partido con 1 gol ${avg(ALL.filter((x) => x.goals === 1).map((x) => x.rating))} · doblete ${avg(ALL.filter((x) => x.goals === 2).map((x) => x.rating))} · triplete ${avg(ALL.filter((x) => x.goals >= 3).map((x) => x.rating))} · 1 asistencia ${avg(ALL.filter((x) => x.assists === 1 && !x.goals).map((x) => x.rating))}`);
const def = ALL.filter((x) => ['CB', 'LB', 'RB'].includes(x.role));
console.log(`Defensas: portería a cero ${avg(def.filter((x) => !x.conceded).map((x) => x.rating))} · derrota encajando 2+ ${avg(def.filter((x) => x.lost && x.conceded >= 2).map((x) => x.rating))} (suspenden ${Math.round((100 * def.filter((x) => x.lost && x.conceded >= 2 && x.rating < 6).length) / Math.max(1, def.filter((x) => x.lost && x.conceded >= 2).length))}%)`);
const rows = seasons.flatMap((s) => [...s.values()]).filter((p) => p.apps >= 25);
const gpg = (lo: number, hi: number) => rows.filter((p) => p.goals / p.apps >= lo && p.goals / p.apps < hi);
for (const [lo, hi, label] of [[1.0, 9, '≥1 gol/partido'], [0.75, 1.0, '0,75–1 gol/partido'], [0.5, 0.75, '0,5–0,75'], [0.25, 0.5, '0,25–0,5']] as const) {
  const g = gpg(lo, hi);
  console.log(`  Goleadores ${label}: ${g.length} temporadas · nota media ${avg(g.map((p) => p.sum / p.apps))}`);
}
const top = rows.sort((a, b) => b.goals - a.goals).slice(0, 6);
console.log('Top goleadores: ' + top.map((p) => `${p.name} ${p.goals}g/${p.apps}pj → ${(p.sum / p.apps).toFixed(2)}`).join(' · '));
const drib = rows.filter((p) => p.dribbles / p.apps >= 3 && p.goals / p.apps < 0.4);
console.log(`Regateadores (≥3 regates/partido, pocos goles): ${drib.length} · nota ${avg(drib.map((p) => p.sum / p.apps))}`);

// Media esperada de un goleador de élite según su ritmo de goles, usando las notas reales del motor
// en sus partidos con 0, 1, 2 y 3+ goles (reparto de goles por partido tipo Poisson).
const elite = new Set(rows.filter((p) => p.goals / p.apps >= 0.8).map((p) => p.name));
const byGoals = [0, 1, 2, 3].map((g) => {
  const xs = ALL_ELITE.filter((x) => (g === 3 ? x.goals >= 3 : x.goals === g)).map((x) => x.rating);
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
});
console.log(`Goleadores de élite según goles en el partido (0/1/2/3+): ${byGoals.map((x) => x.toFixed(2)).join(' / ')}`);
for (const rate of [1.0, 1.1, 1.22, 1.35]) {
  const p0 = Math.exp(-rate), p1 = rate * p0, p2 = (rate ** 2 / 2) * p0, p3 = 1 - p0 - p1 - p2;
  console.log(`  ${rate} goles/partido (${Math.round(rate * 55)} en 55 partidos) → media ≈ ${(p0 * byGoals[0] + p1 * byGoals[1] + p2 * byGoals[2] + p3 * byGoals[3]).toFixed(2)}`);
}
void elite;
