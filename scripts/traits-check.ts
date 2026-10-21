// Mide el efecto real de algunos rasgos simulando el mismo partido con y sin rasgo.
// Uso: npx vite-node scripts/traits-check.ts
import seed from '../src/data/seed.json';
import { simulateMatch } from '../src/engine/match';
import { DEFAULT_SETTINGS, type Role, type SimTeam } from '../src/engine/types';
import { boostFor, type TraitContext } from '../src/game/traits';

const byTeam = new Map<string, typeof seed.players>();
for (const p of seed.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
const sim = (id: string): SimTeam => {
  const t = seed.teams.find((x) => x.id === id)!;
  const m = t.momentum ?? 0;
  return { ...t, att: t.att + m, ctl: t.ctl + m, def: t.def + m, form: 0, penaltyTaker: t.penaltyTaker ?? undefined, players: byTeam.get(id)!.map((p) => ({ ...p, role: p.role as Role, form: 0 })) };
};
const base: TraitContext = { comp: 'league', home: true, neutral: false, final: false, knockout: false, secondLeg: false, lostFirstLeg: false, underdog: false };
const N = 12000;
function run(label: string, homeId: string, awayId: string, ctxHome: Partial<TraitContext>, opts: { neutral?: boolean } = {}) {
  const res = (withTrait: boolean) => {
    let w = 0, poss = 0, goals = 0, counterGoals = 0;
    for (let i = 0; i < N; i++) {
      const h = sim(homeId);
      const a = sim(awayId);
      if (withTrait) h.boost = boostFor(homeId, { ...base, ...ctxHome });
      // El equipo con rasgos juega fuera si el contexto lo pide
      const away = ctxHome.home === false;
      const r = away ? simulateMatch(a, h, DEFAULT_SETTINGS, { neutral: opts.neutral }, 1000 + i) : simulateMatch(h, a, DEFAULT_SETTINGS, { neutral: opts.neutral }, 1000 + i);
      if (away) {
        r.score.reverse();
        r.teams.reverse();
      }
      if (r.score[0] > r.score[1]) w++;
      poss += r.teams[0].possession;
      goals += r.score[0];
      const mySide = away ? 1 : 0;
      counterGoals += r.events.filter((e) => e.t === 'goal' && e.side === mySide && e.counter).length;
    }
    return { w: w / N, poss: poss / N, goals: goals / N, counter: counterGoals / N };
  };
  const off = res(false);
  const on = res(true);
  console.log(`${label}: victoria ${(off.w * 100).toFixed(1)}% → ${(on.w * 100).toFixed(1)}% (×${(on.w / off.w).toFixed(2)}) · posesión ${off.poss.toFixed(0)}% → ${on.poss.toFixed(0)}% · goles ${off.goals.toFixed(2)} → ${on.goals.toFixed(2)}${on.counter ? ` (a la contra ${on.counter.toFixed(2)}/partido)` : ''}`);
}
run('PSG vs Marsella en Ligue 1', 'fra-psg', 'fra-om', {});
run('PSG vs Lens en Ligue 1', 'fra-psg', 'fra-len', {});
run('PSG vs Arsenal en casa, Champions', 'fra-psg', 'eng-ars', { comp: 'ucl' });
run('Madrid contra el Barça (contraataque)', 'esp-rma', 'esp-bar', {});
run('Madrid visitando al Bayern (contraataque)', 'esp-rma', 'ger-mun', { comp: 'ucl', home: false });
run('Madrid vuelta Champions en casa tras perder la ida vs Man City', 'esp-rma', 'eng-mci', { comp: 'ucl', secondLeg: true, lostFirstLeg: true, knockout: true });
run('Madrid en una final vs Bayern (neutral)', 'esp-rma', 'ger-mun', { comp: 'ucl', final: true, knockout: true, neutral: true }, { neutral: true });
run('Barça vs Atlético (posesión)', 'esp-bar', 'esp-atm', {});
run('Athletic vs Real Sociedad en liga', 'esp-ath', 'esp-rso', {});
run('Atlético vs Real Madrid (rival superior)', 'esp-atm', 'esp-rma', { underdog: true });
run('Sevilla en Europa League vs Roma', 'esp-sev', 'ita-rom', { comp: 'uel' });
