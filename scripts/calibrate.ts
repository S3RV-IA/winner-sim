// Simula muchos partidos con los datos reales y muestra distribuciones para calibrar el motor.
// Uso: npm run calibrate
import seed from '../src/data/seed.json';
import { simulateMatch } from '../src/engine/match';
import { DEFAULT_SETTINGS, type Role, type SimTeam } from '../src/engine/types';

type SeedPlayer = (typeof seed.players)[number];
const byTeam = new Map<string, SeedPlayer[]>();
for (const p of seed.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);

const sim = (id: string): SimTeam => {
  const t = seed.teams.find((x) => x.id === id)!;
  return {
    id: t.id, name: t.name, short: t.short, att: t.att, ctl: t.ctl, def: t.def, form: 0, penaltyTaker: t.penaltyTaker ?? undefined,
    players: byTeam.get(t.id)!.map((p) => ({ ...p, role: p.role as Role, form: 0 })),
  };
};
const teams = new Map(seed.teams.map((t) => [t.id, sim(t.id)]));
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
let seedN = 1;

// 1) Liga completa (ida y vuelta) en cada liga, varias veces
const N_SEASONS = Number(process.env.SEASONS ?? 20);
let matches = 0, goals = 0, homeW = 0, draws = 0, awayW = 0, bigMargin = 0, sixPlus = 0;
const scoreFreq = new Map<string, number>();
const roleGoals = new Map<string, number>();
let ratingSum = 0, ratingN = 0, cards = 0, reds = 0, pens = 0, shots = 0, shotsOn = 0;
const topScorers: number[] = [];
const topAssists: number[] = [];
const champPts: number[] = [];
const lastPts: number[] = [];
const scorerNames = new Map<string, number>();
const champions = new Map<string, number>();

for (const lg of seed.leagues) {
  for (let s = 0; s < N_SEASONS; s++) {
    const pts = new Map<string, number>(lg.teams.map((t) => [t, 0]));
    const g = new Map<string, number>();
    const a = new Map<string, number>();
    for (const h of lg.teams)
      for (const aw of lg.teams) {
        if (h === aw) continue;
        const r = simulateMatch(teams.get(h)!, teams.get(aw)!, DEFAULT_SETTINGS, {}, seedN++);
        matches++;
        goals += r.score[0] + r.score[1];
        const key = `${r.score[0]}-${r.score[1]}`;
        scoreFreq.set(key, (scoreFreq.get(key) ?? 0) + 1);
        if (r.score[0] > r.score[1]) { homeW++; pts.set(h, pts.get(h)! + 3); }
        else if (r.score[0] < r.score[1]) { awayW++; pts.set(aw, pts.get(aw)! + 3); }
        else { draws++; pts.set(h, pts.get(h)! + 1); pts.set(aw, pts.get(aw)! + 1); }
        if (Math.abs(r.score[0] - r.score[1]) >= 5) bigMargin++;
        if (Math.max(...r.score) >= 6) sixPlus++;
        for (const p of r.players) {
          if (p.goals) {
            roleGoals.set(p.role, (roleGoals.get(p.role) ?? 0) + p.goals);
            g.set(p.id, (g.get(p.id) ?? 0) + p.goals);
          }
          if (p.assists) a.set(p.id, (a.get(p.id) ?? 0) + p.assists);
          if (p.rating > 0 && p.starter) { ratingSum += p.rating; ratingN++; }
          pens += p.penGoals + p.penMissed;
        }
        cards += r.teams[0].yellow + r.teams[1].yellow;
        reds += r.teams[0].red + r.teams[1].red;
        shots += r.teams[0].shots + r.teams[1].shots;
        shotsOn += r.teams[0].shotsOn + r.teams[1].shotsOn;
      }
    const sortedPts = [...pts.entries()].sort((x, y) => y[1] - x[1]);
    champPts.push(sortedPts[0][1]);
    lastPts.push(sortedPts[sortedPts.length - 1][1]);
    champions.set(sortedPts[0][0], (champions.get(sortedPts[0][0]) ?? 0) + 1);
    const best = [...g.entries()].sort((x, y) => y[1] - x[1])[0];
    topScorers.push(best[1]);
    const name = seed.players.find((p) => p.id === best[0])!.name;
    scorerNames.set(name, (scorerNames.get(name) ?? 0) + 1);
    topAssists.push([...a.values()].sort((x, y) => y - x)[0]);
  }
}

const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
console.log(`\n=== ${matches} partidos de liga (${N_SEASONS} temporadas por liga) ===`);
console.log(`Goles/partido ${(goals / matches).toFixed(2)}   [real ≈ 2.7–2.9]`);
console.log(`Local ${pct(homeW, matches)} · Empate ${pct(draws, matches)} · Visitante ${pct(awayW, matches)}   [real ≈ 44 / 25 / 31]`);
console.log(`Diferencia ≥5: ${pct(bigMargin, matches)} · Un equipo con ≥6: ${pct(sixPlus, matches)}`);
console.log(`Tiros/partido ${(shots / matches).toFixed(1)} (a puerta ${(shotsOn / matches).toFixed(1)})   [real ≈ 25 / 8.5]`);
console.log(`Amarillas/partido ${(cards / matches).toFixed(2)} · Rojas ${(reds / matches).toFixed(3)} · Penaltis ${(pens / matches).toFixed(2)}   [real ≈ 3.8 / 0.12 / 0.28]`);
console.log(`Nota media titulares ${(ratingSum / ratingN).toFixed(2)}   [SofaScore ≈ 6.8]`);
console.log('Resultados más frecuentes:', [...scoreFreq.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `${k} ${pct(v, matches)}`).join(' · '));
const totalG = [...roleGoals.values()].reduce((s, x) => s + x, 0);
console.log('Goles por puesto:', [...roleGoals.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${pct(v, totalG)}`).join(' · '));
console.log(`Pichichi medio ${avg(topScorers)} goles (máx ${Math.max(...topScorers)}) · Máx. asistente medio ${avg(topAssists)}`);
console.log(`Puntos campeón medio ${avg(champPts)} · Puntos colista medio ${avg(lastPts)}`);
console.log('Campeones:', [...champions.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${teams.get(k)!.short} ${v}`).join(', '));
console.log('Pichichis:', [...scorerNames.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '));

// 2) Enfrentamiento desigual: Real Madrid en casa contra el peor de LaLiga
const esp = seed.leagues.find((l) => l.id === 'esp')!;
const weakest = esp.teams.map((id) => seed.teams.find((t) => t.id === id)!).sort((x, y) => x.ovr - y.ovr)[0];
const N = 20000;
let w = 0, d = 0, l = 0, five = 0;
const f2 = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const r = simulateMatch(teams.get('esp-rma')!, teams.get(weakest.id)!, DEFAULT_SETTINGS, {}, seedN++);
  if (r.score[0] > r.score[1]) w++; else if (r.score[0] === r.score[1]) d++; else l++;
  if (r.score[0] - r.score[1] >= 5) five++;
  const key = `${r.score[0]}-${r.score[1]}`;
  f2.set(key, (f2.get(key) ?? 0) + 1);
}
console.log(`\n=== Real Madrid (98) vs ${weakest.name} (${weakest.ovr}) en casa, ${N} partidos ===`);
console.log(`Victoria ${pct(w, N)} · Empate ${pct(d, N)} · Derrota ${pct(l, N)} · Gana por ≥5: ${pct(five, N)}`);
console.log('Resultados:', [...f2.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k} ${pct(v, N)}`).join(' · '));
