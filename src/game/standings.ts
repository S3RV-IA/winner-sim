import type { LeagueId, Match, StandingRow } from './types';

/**
 * Criterios de desempate con los mismos puntos. Los «h2h» miran solo los partidos entre los equipos empatados
 * (una mini-liga si son más de dos) y solo cuentan cuando ya se han jugado la ida y la vuelta entre todos ellos.
 */
type Criterion = 'gd' | 'gf' | 'wins' | 'awayGf' | 'awayWins' | 'h2hPts' | 'h2hGd' | 'h2hGf' | 'h2hAwayGf';

/** Orden de desempate de cada liga según su reglamento actual; sin liga, el de la fase de liga de la UEFA. */
const TIEBREAKS: Record<LeagueId | 'uefa', Criterion[]> = {
  esp: ['h2hPts', 'h2hGd', 'gd', 'gf'],
  ita: ['h2hPts', 'h2hGd', 'gd', 'gf'],
  por: ['h2hPts', 'h2hGd', 'gd', 'wins', 'gf'],
  eng: ['gd', 'gf', 'h2hPts', 'h2hAwayGf'],
  ger: ['gd', 'gf', 'h2hPts', 'h2hGf', 'h2hAwayGf'],
  fra: ['gd', 'h2hPts', 'h2hGd', 'h2hGf', 'gf'],
  uefa: ['gd', 'gf', 'awayGf', 'wins', 'awayWins'],
};

/** Clasificación a partir de los partidos jugados, con los desempates de la liga indicada (o de la UEFA). */
export function computeStandings(teamIds: string[], matches: Match[], leagueId?: LeagueId): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, last: [] }]),
  );
  const played = matches
    .filter((m) => m.status === 'played' && m.score && rows.has(m.homeId) && rows.has(m.awayId))
    .sort((a, b) => a.slot - b.slot || (a.playedOrder ?? 0) - (b.playedOrder ?? 0));
  for (const m of played) {
    const h = rows.get(m.homeId)!;
    const a = rows.get(m.awayId)!;
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

  const criteria = TIEBREAKS[leagueId ?? 'uefa'];
  const byPoints = groupBy([...rows.values()], (r) => r.points);
  return byPoints.flatMap((group) => resolve(group, criteria, played, group));
}

/**
 * Ordena un grupo de equipos empatados aplicando los criterios uno a uno a cada subgrupo que siga empatado.
 * Los criterios de enfrentamiento directo se calculan siempre sobre todos los empatados a puntos (	ied),
 * como en el reglamento de LaLiga: con tres empatados cuenta la mini-liga de los tres hasta el final.
 */
function resolve(group: StandingRow[], criteria: Criterion[], played: Match[], tied: StandingRow[]): StandingRow[] {
  if (group.length < 2) return group;
  if (!criteria.length) return [...group].sort((x, y) => x.teamId.localeCompare(y.teamId));
  const [c, ...rest] = criteria;
  const value = valuesFor(c, tied, played);
  return groupBy(group, (r) => value.get(r.teamId) ?? 0).flatMap((sub) => resolve(sub, rest, played, tied));
}

/** Valor de un criterio para cada equipo del grupo (más alto = mejor). */
function valuesFor(c: Criterion, group: StandingRow[], played: Match[]): Map<string, number> {
  const out = new Map<string, number>();
  const ids = new Set(group.map((r) => r.teamId));
  const h2h = c.startsWith('h2h');
  // Enfrentamiento directo: solo los partidos entre ellos, y solo si ya han jugado ida y vuelta todos contra todos
  const pool = h2h ? played.filter((m) => ids.has(m.homeId) && ids.has(m.awayId)) : played.filter((m) => ids.has(m.homeId) || ids.has(m.awayId));
  if (h2h && pool.length < group.length * (group.length - 1)) return out;
  for (const r of group) {
    if (c === 'gd') out.set(r.teamId, r.gf - r.ga);
    else if (c === 'gf') out.set(r.teamId, r.gf);
    else if (c === 'wins') out.set(r.teamId, r.won);
    else out.set(r.teamId, 0);
  }
  if (c === 'gd' || c === 'gf' || c === 'wins') return out;
  const add = (id: string, v: number) => ids.has(id) && out.set(id, (out.get(id) ?? 0) + v);
  for (const m of pool) {
    const [hg, ag] = m.score!;
    if (c === 'h2hPts') {
      add(m.homeId, hg > ag ? 3 : hg === ag ? 1 : 0);
      add(m.awayId, ag > hg ? 3 : hg === ag ? 1 : 0);
    } else if (c === 'h2hGd') {
      add(m.homeId, hg - ag);
      add(m.awayId, ag - hg);
    } else if (c === 'h2hGf') {
      add(m.homeId, hg);
      add(m.awayId, ag);
    } else if (c === 'h2hAwayGf' || c === 'awayGf') add(m.awayId, ag);
    else if (c === 'awayWins' && ag > hg) add(m.awayId, 1);
  }
  return out;
}

/** Agrupa por un valor y devuelve los grupos de mayor a menor (el orden dentro de cada grupo se conserva). */
function groupBy(rows: StandingRow[], key: (r: StandingRow) => number): StandingRow[][] {
  const groups = new Map<number, StandingRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, g]) => g);
}
