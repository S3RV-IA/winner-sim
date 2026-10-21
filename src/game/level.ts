import type { Team } from './types';

/** Peso del control frente a ataque y defensa (en el motor influye menos en los goles). */
export const CTL_W = 0.56;

/** Media ponderada que usa la app como «media» de un equipo. */
export const weightedOvr = (v: { att: number; ctl: number; def: number }) => (v.att + v.def + CTL_W * v.ctl) / (2 + CTL_W);

/** Nivel con el que juega hoy: nivel histórico (base) + momento del club. La racha se suma después en el motor. */
export function currentRatings(t: Pick<Team, 'att' | 'ctl' | 'def' | 'momentum'>) {
  const m = t.momentum ?? 0;
  return { att: t.att + m, ctl: t.ctl + m, def: t.def + m };
}

export const currentOvr = (t: Pick<Team, 'att' | 'ctl' | 'def' | 'momentum'>) => Math.round(weightedOvr(currentRatings(t)));
