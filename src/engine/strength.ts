import { NO_BOOST, type SimSettings, type SimTeam, type TeamBoost } from './types';

/** Goles por equipo y partido entre dos equipos iguales en campo neutral. */
export const BASE_GOALS = 1.22;
/** Peso de (ataque − defensa rival) en los goles esperados, por cada 10 puntos. */
export const ATT_DEF_WEIGHT = 0.25;
/** Peso de (control − control rival) en los goles esperados, por cada 10 puntos. */
export const CONTROL_WEIGHT = 0.07;

/** Las diferencias pequeñas cuentan casi enteras; las enormes se saturan (evita goleadas continuas). */
const saturate = (d: number) => 20 * Math.tanh(d / 20);

export interface EffectiveTeam {
  att: number;
  ctl: number;
  def: number;
}

/** Nivel efectivo: la forma suma o resta como mucho `formImpact` puntos. */
export function effective(team: Pick<SimTeam, 'att' | 'ctl' | 'def' | 'form'>, settings: SimSettings): EffectiveTeam {
  const shift = team.form * settings.formImpact;
  return { att: team.att + shift, ctl: team.ctl + shift, def: team.def + shift };
}

/** Goles esperados [local, visitante] antes del factor del día. */
export function expectedGoals(home: EffectiveTeam, away: EffectiveTeam, settings: SimSettings, neutral = false): [number, number] {
  const ha = neutral ? 1 : settings.homeAdvantage;
  const h = BASE_GOALS * Math.exp((ATT_DEF_WEIGHT * saturate(home.att - away.def) + CONTROL_WEIGHT * saturate(home.ctl - away.ctl)) / 10) * ha;
  const a = BASE_GOALS * Math.exp((ATT_DEF_WEIGHT * saturate(away.att - home.def) + CONTROL_WEIGHT * saturate(away.ctl - home.ctl)) / 10) / ha;
  return [h, a];
}

/** Posesión del local (%) según el control. */
export function possessionShare(home: EffectiveTeam, away: EffectiveTeam, neutral = false): number {
  return 50 + 22 * Math.tanh((home.ctl - away.ctl) / 25) + (neutral ? 0 : 1.5);
}

function poissonPmf(lambda: number, max: number): number[] {
  const p: number[] = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) p.push((p[k - 1] * lambda) / k);
  return p;
}

/** Probabilidades [victoria local, empate, victoria visitante] con un modelo de Poisson. */
export function outcomeOdds(xg: [number, number]): [number, number, number] {
  const ph = poissonPmf(xg[0], 12);
  const pa = poissonPmf(xg[1], 12);
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= 12; i++)
    for (let j = 0; j <= 12; j++) {
      const p = ph[i] * pa[j];
      if (i > j) w += p;
      else if (i === j) d += p;
      else l += p;
    }
  const s = w + d + l;
  return [w / s, d / s, l / s];
}

export type MatchSide = Pick<SimTeam, 'att' | 'ctl' | 'def' | 'form' | 'boost'>;

export interface Prematch {
  boosts: readonly [TeamBoost, TeamBoost];
  eff: [EffectiveTeam, EffectiveTeam];
  /** Goles esperados antes del factor del día. */
  xg: [number, number];
  /** Probabilidades [local, empate, visitante]. */
  odds: [number, number, number];
}

/**
 * Lo que se sabe antes del partido: nivel efectivo (nivel actual + racha + rasgos), goles esperados
 * y probabilidades. Lo usan el motor y el pronóstico de la ficha, así que siempre coinciden.
 */
export function prematch(home: MatchSide, away: MatchSide, settings: SimSettings, neutral = false): Prematch {
  const boosts = [home.boost ?? NO_BOOST, away.boost ?? NO_BOOST] as const;
  const eff = [home, away].map((t, s) => {
    const e = effective(t, settings);
    return { att: e.att, ctl: e.ctl + boosts[s].ctl, def: e.def + boosts[s].def };
  }) as [EffectiveTeam, EffectiveTeam];
  const base = expectedGoals(eff[0], eff[1], settings, neutral);
  // Rasgos históricos: multiplican los goles esperados propios y reducen los del rival
  const xg: [number, number] = [base[0] * boosts[0].xg * boosts[1].oppXg, base[1] * boosts[1].xg * boosts[0].oppXg];
  return { boosts, eff, xg, odds: outcomeOdds(xg) };
}
