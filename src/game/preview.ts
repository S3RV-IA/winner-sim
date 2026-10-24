import { db } from '../db/db';
import { prematch } from '../engine/strength';
import { currentOvr, currentRatings } from './level';
import { computeStandings } from './standings';
import { matchBoosts } from './traits';
import type { Competition, Config, Match, StandingRow, Team } from './types';

export interface MatchPreview {
  /** Probabilidades [local, empate, visitante] a 90 minutos. */
  odds: [number, number, number];
  /** Cuotas decimales con el margen típico de una casa de apuestas (≈ 6 %). */
  quotes: [number, number, number];
  xg: [number, number];
  /** Rasgos que estarán activos [local, visitante]. */
  traits: [string[], string[]];
}

const MARGIN = 1.06;

/** Pronóstico de un partido pendiente con el mismo cálculo que usa el motor. */
export function previewMatch(m: Match, comp: Competition, home: Team, away: Team, leg1: Match | undefined, config: Config): MatchPreview {
  const side = (t: Team) => ({ ...currentRatings(t), form: t.form });
  const h = side(home);
  const a = side(away);
  if (config.traits !== false) {
    const ovr = (id: string) => currentOvr(id === home.id ? home : away);
    const [bh, ba] = matchBoosts(m, comp, leg1, ovr);
    Object.assign(h, { boost: bh });
    Object.assign(a, { boost: ba });
  }
  const p = prematch(h, a, config.sim, !!m.neutral);
  return {
    odds: p.odds,
    quotes: p.odds.map((x) => Math.max(1.01, 1 / (x * MARGIN))) as [number, number, number],
    xg: p.xg,
    traits: [p.boosts[0].labels, p.boosts[1].labels],
  };
}

export interface HeadToHead {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  /** Partidos jugados, del más reciente al más antiguo. */
  matches: Match[];
}

/** Historial de enfrentamientos de `teamId` contra `rivalId` en todas las temporadas y competiciones. */
export async function headToHead(teamId: string, rivalId: string): Promise<HeadToHead> {
  const [asHome, asAway] = await Promise.all([
    db.matches.where('homeId').equals(teamId).filter((m) => m.awayId === rivalId && m.status === 'played').toArray(),
    db.matches.where('awayId').equals(teamId).filter((m) => m.homeId === rivalId && m.status === 'played').toArray(),
  ]);
  const matches = [...asHome, ...asAway].sort((x, y) => y.seasonId - x.seasonId || y.slot - x.slot);
  const h: HeadToHead = { played: matches.length, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, matches };
  for (const m of matches) {
    const [mine, theirs] = m.homeId === teamId ? m.score! : [m.score![1], m.score![0]];
    h.gf += mine;
    h.ga += theirs;
    if (mine > theirs) h.won++;
    else if (mine < theirs) h.lost++;
    else h.drawn++;
  }
  return h;
}

type Outcome = 'W' | 'D' | 'L';

export interface TeamSnapshot {
  /** Clasificación en su liga esta temporada (null si aún no ha jugado ninguna jornada). */
  league: { position: number; teams: number; row: StandingRow } | null;
  /** Todos sus partidos de la temporada, en cualquier competición. */
  played: number;
  gf: number;
  ga: number;
  /** Últimos 5 resultados en cualquier competición, del más antiguo al más reciente. */
  last: Outcome[];
  /** Racha actual en palabras («3 victorias seguidas», «4 sin ganar»…) y si es buena o mala. */
  streak: { text: string; tone: 'good' | 'bad' } | null;
}

/** Cómo llega un equipo a un partido: puesto en su liga, goles de la temporada y racha. */
export async function teamSnapshot(team: Team, seasonId: number): Promise<TeamSnapshot> {
  const [asHome, asAway, league] = await Promise.all([
    db.matches.where('homeId').equals(team.id).filter((m) => m.seasonId === seasonId && m.status === 'played').toArray(),
    db.matches.where('awayId').equals(team.id).filter((m) => m.seasonId === seasonId && m.status === 'played').toArray(),
    db.competitions.where('seasonId').equals(seasonId).filter((c) => c.type === 'league' && c.leagueId === team.leagueId).first(),
  ]);
  const matches = [...asHome, ...asAway].sort((a, b) => a.slot - b.slot || (a.playedOrder ?? 0) - (b.playedOrder ?? 0));
  let gf = 0;
  let ga = 0;
  const results: Outcome[] = [];
  for (const m of matches) {
    const [mine, theirs] = m.homeId === team.id ? m.score! : [m.score![1], m.score![0]];
    gf += mine;
    ga += theirs;
    results.push(mine > theirs ? 'W' : mine < theirs ? 'L' : 'D');
  }

  let snapshotLeague: TeamSnapshot['league'] = null;
  if (league) {
    const leagueMatches = matches.filter((m) => m.compId === league.id);
    if (leagueMatches.length) {
      const all = await db.matches.where('compId').equals(league.id).filter((m) => m.status === 'played').toArray();
      const table = computeStandings(league.teams, all);
      const position = table.findIndex((r) => r.teamId === team.id);
      snapshotLeague = { position: position + 1, teams: table.length, row: table[position] };
    }
  }

  return { league: snapshotLeague, played: matches.length, gf, ga, last: results.slice(-5), streak: streakOf(results) };
}

/** Racha a partir de los resultados (del más antiguo al más reciente). */
function streakOf(results: Outcome[]): TeamSnapshot['streak'] {
  const recent = [...results].reverse();
  const run = (ok: (r: Outcome) => boolean) => {
    const i = recent.findIndex((r) => !ok(r));
    return i === -1 ? recent.length : i;
  };
  const wins = run((r) => r === 'W');
  if (wins >= 2) return { text: `${wins} victorias seguidas`, tone: 'good' };
  const losses = run((r) => r === 'L');
  if (losses >= 2) return { text: `${losses} derrotas seguidas`, tone: 'bad' };
  const unbeaten = run((r) => r !== 'L');
  if (unbeaten >= 3) return { text: `${unbeaten} partidos sin perder`, tone: 'good' };
  const winless = run((r) => r !== 'W');
  if (winless >= 3) return { text: `${winless} partidos sin ganar`, tone: 'bad' };
  return null;
}

/** Derbis y grandes rivalidades (se muestran como accesos directos en la ficha del equipo). */
export const RIVALS: Record<string, string[]> = {
  'esp-rma': ['esp-bar', 'esp-atm'],
  'esp-bar': ['esp-rma', 'esp-esp'],
  'esp-atm': ['esp-rma', 'esp-bar'],
  'esp-ath': ['esp-rso', 'esp-osa'],
  'esp-rso': ['esp-ath', 'esp-osa'],
  'esp-sev': ['esp-bet'],
  'esp-bet': ['esp-sev'],
  'esp-val': ['esp-lev', 'esp-vil'],
  'esp-cel': ['esp-dep'],
  'esp-dep': ['esp-cel'],
  'esp-esp': ['esp-bar'],
  'esp-osa': ['esp-ath', 'esp-rso'],
  'esp-vil': ['esp-val'],
  'esp-lev': ['esp-val'],
  'eng-mun': ['eng-mci', 'eng-liv', 'eng-lee'],
  'eng-mci': ['eng-mun', 'eng-liv'],
  'eng-liv': ['eng-eve', 'eng-mun', 'eng-mci'],
  'eng-eve': ['eng-liv'],
  'eng-ars': ['eng-tot', 'eng-che'],
  'eng-tot': ['eng-ars', 'eng-che'],
  'eng-che': ['eng-tot', 'eng-ars'],
  'eng-new': ['eng-sun'],
  'eng-sun': ['eng-new'],
  'eng-avl': ['eng-cov'],
  'eng-lee': ['eng-mun'],
  'eng-bha': ['eng-cry'],
  'eng-cry': ['eng-bha'],
  'ger-mun': ['ger-dor'],
  'ger-dor': ['ger-sch', 'ger-mun'],
  'ger-sch': ['ger-dor'],
  'ger-ham': ['ger-bre'],
  'ger-bre': ['ger-ham'],
  'ger-kol': ['ger-mon'],
  'ger-mon': ['ger-kol'],
  'ita-int': ['ita-mil', 'ita-juv'],
  'ita-mil': ['ita-int', 'ita-juv'],
  'ita-juv': ['ita-tor', 'ita-int'],
  'ita-tor': ['ita-juv'],
  'ita-rom': ['ita-laz'],
  'ita-laz': ['ita-rom'],
  'ita-nap': ['ita-juv', 'ita-rom'],
  'fra-psg': ['fra-om'],
  'fra-om': ['fra-psg', 'fra-ol'],
  'fra-ol': ['fra-om'],
  'fra-nic': ['fra-asm'],
  'fra-asm': ['fra-nic'],
  'fra-len': ['fra-lil'],
  'fra-lil': ['fra-len'],
  'por-ben': ['por-scp', 'por-por'],
  'por-scp': ['por-ben', 'por-por'],
  'por-por': ['por-ben', 'por-scp'],
  'por-bra': ['por-vsc'],
  'por-vsc': ['por-bra'],
};
