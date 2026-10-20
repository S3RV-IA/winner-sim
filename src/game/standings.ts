import type { Match, StandingRow } from './types';

/** Clasificación a partir de los partidos jugados: puntos, diferencia de goles, goles a favor. */
export function computeStandings(teamIds: string[], matches: Match[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, last: [] }]),
  );
  const played = matches
    .filter((m) => m.status === 'played' && m.score)
    .sort((a, b) => a.slot - b.slot || (a.playedOrder ?? 0) - (b.playedOrder ?? 0));
  for (const m of played) {
    const h = rows.get(m.homeId);
    const a = rows.get(m.awayId);
    if (!h || !a) continue;
    const [hg, ag] = m.score!;
    h.played++;
    a.played++;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    if (hg > ag) {
      h.won++;
      a.lost++;
      h.points += 3;
      h.last.push('W');
      a.last.push('L');
    } else if (hg < ag) {
      a.won++;
      h.lost++;
      a.points += 3;
      h.last.push('L');
      a.last.push('W');
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
      h.last.push('D');
      a.last.push('D');
    }
  }
  for (const r of rows.values()) r.last = r.last.slice(-5);
  return [...rows.values()].sort(
    (x, y) => y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || y.won - x.won || x.teamId.localeCompare(y.teamId),
  );
}
