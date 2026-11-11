import { describe, expect, it } from 'vitest';
import { computeStandings } from './standings';
import type { Match } from './types';

let n = 0;
/** Partido jugado entre dos equipos. */
const m = (home: string, away: string, hg: number, ag: number): Match => ({
  id: `m${n++}`, seasonId: 1, compId: 'l', round: n, slot: n, homeId: home, awayId: away, status: 'played', seed: 1, score: [hg, ag],
});
const order = (matches: Match[], teams: string[], league?: 'esp' | 'eng' | 'fra') => computeStandings(teams, matches, league).map((r) => r.teamId);

describe('Desempates de la clasificación', () => {
  // A y B acaban con 7 puntos: A gana el directo (1-0 y 1-1) pero B tiene mejor diferencia de goles (+5 frente a +1)
  const duel = [m('A', 'B', 1, 0), m('B', 'A', 1, 1), m('B', 'C', 5, 0), m('C', 'A', 1, 0), m('A', 'C', 1, 0), m('C', 'B', 0, 1)];

  it('en LaLiga manda el enfrentamiento directo', () => {
    expect(order(duel, ['A', 'B', 'C'], 'esp').slice(0, 2)).toEqual(['A', 'B']);
  });
  it('en la Premier manda la diferencia de goles', () => {
    expect(order(duel, ['A', 'B', 'C'], 'eng').slice(0, 2)).toEqual(['B', 'A']);
  });
  it('si cada uno ganó un partido, decide la diferencia de goles entre ellos', () => {
    // A y B con 7 puntos: A gana 3-0 y pierde 1-0 (+2 en el directo), aunque B tenga mejor diferencia general (+7 frente a +3)
    const split = [m('A', 'B', 3, 0), m('B', 'A', 1, 0), m('B', 'C', 9, 0), m('A', 'C', 1, 0), m('C', 'A', 1, 1), m('C', 'B', 1, 1)];
    expect(order(split, ['A', 'B', 'C'], 'esp').slice(0, 2)).toEqual(['A', 'B']);
  });
  it('el directo solo cuenta cuando ya se han jugado la ida y la vuelta', () => {
    // Solo la ida (A ganó 1-0): con los mismos puntos decide la diferencia de goles general
    const onlyFirstLeg = [m('A', 'B', 1, 0), m('B', 'C', 4, 0), m('C', 'A', 0, 0), m('C', 'B', 1, 1)];
    expect(order(onlyFirstLeg, ['A', 'B', 'C'], 'esp').slice(0, 2)).toEqual(['B', 'A']);
  });
  it('con tres empatados se hace una mini-liga con sus partidos entre ellos', () => {
    // C, E y D con 13 puntos. Mini-liga: C 7, E 7, D 3 → D tercero. C y E también empatan en diferencia de goles
    // de la mini-liga (+2), así que decide la diferencia general: C +3, E +1. En la Premier sería C, D, E.
    const five = [
      m('A', 'B', 2, 2), m('A', 'C', 2, 0), m('A', 'D', 1, 3), m('A', 'E', 1, 2), m('B', 'A', 3, 3), m('B', 'C', 1, 3), m('B', 'D', 0, 3),
      m('B', 'E', 3, 2), m('C', 'A', 2, 0), m('C', 'B', 0, 1), m('C', 'D', 3, 0), m('C', 'E', 2, 2), m('D', 'A', 2, 2), m('D', 'B', 3, 2),
      m('D', 'C', 1, 2), m('D', 'E', 3, 2), m('E', 'A', 1, 3), m('E', 'B', 3, 2), m('E', 'C', 2, 0), m('E', 'D', 1, 0),
    ];
    const teams = ['A', 'B', 'C', 'D', 'E'];
    expect(computeStandings(teams, five, 'esp').slice(0, 3).map((r) => r.points)).toEqual([13, 13, 13]);
    expect(order(five, teams, 'esp').slice(0, 3)).toEqual(['C', 'E', 'D']);
    expect(order(five, teams, 'eng').slice(0, 3)).toEqual(['C', 'D', 'E']);
  });
});
