import { describe, expect, it } from 'vitest';
import { ballonDorScore } from './awards';
import { emptyStats } from './stats';
import type { CompType, PlayerCompStats } from './types';

/** Fila de estadísticas de un jugador en una competición. */
function row(compId: string, compType: CompType, apps: number, goals: number, assists: number, avg: number, motm: number): PlayerCompStats {
  const s = emptyStats(`${compId}|x`, 1, compId, compType, 'x', 't');
  return { ...s, apps, starts: apps, minutes: apps * 85, goals, assists, ratingSum: avg * apps, rated: apps, motm };
}
const games = (entries: [string, number][]) => new Map(entries);

describe('Balón de Oro', () => {
  // Mbappé: 42 goles y campeón de Europa (sin liga)
  const mbappe = ballonDorScore({
    role: 'ST', leagueId: 'esp', honors: { ucl: 'win', league: 'second' },
    rows: [row('l', 'league', 36, 30, 5, 7.6, 9), row('u', 'ucl', 15, 12, 1, 7.7, 4)],
    teamGames: games([['l', 38], ['u', 15]]),
  });
  // Guirassy: 44 goles, Bundesliga y copa, cae en cuartos de Champions
  const guirassy = ballonDorScore({
    role: 'ST', leagueId: 'ger', honors: { league: 'win', cup: 'win', ucl: 'quarter' },
    rows: [row('l', 'league', 33, 36, 3, 7.5, 9), row('u', 'ucl', 10, 4, 1, 7.2, 1), row('c', 'cup', 4, 4, 0, 7.6, 1)],
    teamGames: games([['l', 34], ['u', 12], ['c', 4]]),
  });
  // Kane: 48 goles sin títulos (segundo en liga, semifinal de Champions)
  const kane = ballonDorScore({
    role: 'ST', leagueId: 'ger', honors: { league: 'second', ucl: 'semi' },
    rows: [row('l', 'league', 34, 38, 4, 7.6, 10), row('u', 'ucl', 14, 10, 1, 7.5, 3)],
    teamGames: games([['l', 34], ['u', 14]]),
  });

  it('la Champions pesa más que unos pocos goles de diferencia', () => {
    expect(mbappe.total).toBeGreaterThan(guirassy.total);
  });
  it('un goleador sin títulos no supera al campeón de Europa con números parecidos', () => {
    expect(mbappe.total).toBeGreaterThan(kane.total);
  });
  it('los títulos solo cuentan de verdad para jugadores importantes en su equipo', () => {
    const suplente = ballonDorScore({
      role: 'CM', leagueId: 'esp', honors: { ucl: 'win', league: 'win' },
      rows: [row('l', 'league', 10, 1, 1, 6.8, 0), row('u', 'ucl', 3, 0, 0, 6.7, 0)],
      teamGames: games([['l', 38], ['u', 15]]),
    });
    expect(suplente.titles).toBeLessThan(15);
  });
  it('resumen', () => {
    console.log(`Mbappé ${mbappe.total.toFixed(1)} (${mbappe.individual.toFixed(1)} + títulos ${mbappe.titles.toFixed(1)}) · ` +
      `Guirassy ${guirassy.total.toFixed(1)} (${guirassy.individual.toFixed(1)} + ${guirassy.titles.toFixed(1)}) · ` +
      `Kane ${kane.total.toFixed(1)} (${kane.individual.toFixed(1)} + ${kane.titles.toFixed(1)})`);
  });
});
