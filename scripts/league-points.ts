// Solo análisis (no cambia nada): puntos, victorias, empates y derrotas por temporada de los grandes de LaLiga
// con el motor completo (forma que evoluciona, momento del club y rasgos). Uso: npx vite-node scripts/league-points.ts
import seed from '../src/data/seed.json';
import { nextTeamForm } from '../src/engine/form';
import { simulateMatch } from '../src/engine/match';
import { Rng } from '../src/engine/rng';
import { DEFAULT_SETTINGS, type Role, type SimTeam } from '../src/engine/types';
import { doubleRoundRobin } from '../src/game/schedule';
import { boostFor } from '../src/game/traits';

const LEAGUE = process.env.LEAGUE ?? 'esp';
const SEASONS = Number(process.env.SEASONS ?? 30);
const WATCH = (process.env.WATCH ?? 'esp-rma,esp-bar,esp-atm').split(',');
const lg = seed.leagues.find((l) => l.id === LEAGUE)!;
const byTeam = new Map<string, typeof seed.players>();
for (const p of seed.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
const base = (id: string): SimTeam => {
  const t = seed.teams.find((x) => x.id === id)!;
  const m = t.momentum ?? 0;
  return { ...t, att: t.att + m, ctl: t.ctl + m, def: t.def + m, form: 0, penaltyTaker: t.penaltyTaker ?? undefined, players: byTeam.get(id)!.map((p) => ({ ...p, role: p.role as Role, form: 0 })) };
};
const totals = new Map(WATCH.map((id) => [id, { pts: [] as number[], w: 0, d: 0, l: 0, titles: 0, pos: 0 }]));
let seedN = 1;
for (let s = 0; s < SEASONS; s++) {
  const form = new Map(lg.teams.map((id) => [id, 0]));
  const pts = new Map(lg.teams.map((id) => [id, 0]));
  for (const round of doubleRoundRobin(lg.teams, new Rng(s * 977 + 3))) {
    for (const [h, a] of round) {
      const home = { ...base(h), form: form.get(h)! };
      const away = { ...base(a), form: form.get(a)! };
      const ctx = { comp: 'league' as const, neutral: false, final: false, knockout: false, secondLeg: false, lostFirstLeg: false, underdog: false };
      home.boost = boostFor(h, { ...ctx, home: true });
      away.boost = boostFor(a, { ...ctx, home: false });
      const r = simulateMatch(home, away, DEFAULT_SETTINGS, {}, seedN++);
      const [hg, ag] = r.score;
      const p = hg > ag ? [3, 0] : hg < ag ? [0, 3] : [1, 1];
      pts.set(h, pts.get(h)! + p[0]);
      pts.set(a, pts.get(a)! + p[1]);
      form.set(h, nextTeamForm(form.get(h)!, r.odds, p[0]));
      form.set(a, nextTeamForm(form.get(a)!, [r.odds[2], r.odds[1], r.odds[0]], p[1]));
      for (const [id, my] of [[h, p[0]], [a, p[1]]] as const) {
        const t = totals.get(id);
        if (!t) continue;
        if (my === 3) t.w++;
        else if (my === 1) t.d++;
        else t.l++;
      }
    }
  }
  const table = [...pts.entries()].sort((x, y) => y[1] - x[1]);
  for (const [id, t] of totals) {
    t.pts.push(pts.get(id)!);
    t.pos += table.findIndex(([x]) => x === id) + 1;
    if (table[0][0] === id) t.titles++;
  }
}
const games = (lg.teams.length - 1) * 2;
console.log(`${lg.id} · ${SEASONS} temporadas de ${games} jornadas (motor completo: forma, momento y rasgos)`);
for (const [id, t] of totals) {
  const avg = t.pts.reduce((a, b) => a + b, 0) / SEASONS;
  const name = seed.teams.find((x) => x.id === id)!.short;
  console.log(`  ${name}: ${avg.toFixed(1)} pts (min ${Math.min(...t.pts)}, máx ${Math.max(...t.pts)}) · V/E/D por temporada ${(t.w / SEASONS).toFixed(1)}/${(t.d / SEASONS).toFixed(1)}/${(t.l / SEASONS).toFixed(1)} · puesto medio ${(t.pos / SEASONS).toFixed(1)} · ligas ${t.titles}`);
}
