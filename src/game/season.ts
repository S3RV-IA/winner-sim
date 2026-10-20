import { Rng, randomSeed } from '../engine/rng';
import { CUP_WEEKS, DAY, EURO_WEEKS, leagueWeeks, slot } from './calendar';
import { CUP_NAMES, EURO_SIZES, LEAGUE_ORDER } from './defaults';
import { doubleRoundRobin, swissLeaguePhase } from './schedule';
import type { Competition, CompType, Config, League, LeagueId, Match, RoundInfo, Season, Team } from './types';

export const seasonLabel = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
export const compId = (seasonId: number, type: CompType, leagueId?: LeagueId) => (leagueId ? `${seasonId}-${type}-${leagueId}` : `${seasonId}-${type}`);

export interface SeasonInput {
  seasonId: number;
  year: number;
  leagues: League[];
  teams: Map<string, Team>;
  config: Config;
  /** Clasificación final de cada liga en la temporada anterior (o el orden inicial en la primera). */
  ranked: Record<LeagueId, string[]>;
  /** Campeones de copa de la temporada anterior. */
  cupWinners: Partial<Record<LeagueId, string>>;
}

export interface SeasonBundle {
  season: Season;
  competitions: Competition[];
  matches: Match[];
}

/** Crea una temporada completa: 6 ligas, 6 copas, Champions y Europa League. */
export function createSeason(input: SeasonInput): SeasonBundle {
  const rng = new Rng(randomSeed());
  const { seasonId, year } = input;
  const competitions: Competition[] = [];
  const matches: Match[] = [];

  for (const lg of input.leagues) {
    // Liga
    const id = compId(seasonId, 'league', lg.id);
    const fixtures = doubleRoundRobin(lg.teams, rng);
    const weeks = leagueWeeks(fixtures.length);
    const rounds: RoundInfo[] = fixtures.map((_, r) => ({ round: r + 1, label: `Jornada ${r + 1}`, slot: slot(weeks[r], DAY.league), kind: 'league' }));
    competitions.push({ id, seasonId, type: 'league', leagueId: lg.id, name: lg.name, teams: [...lg.teams], rounds, status: 'active' });
    fixtures.forEach((round, r) =>
      round.forEach(([h, a], i) =>
        matches.push({ id: `${id}-${r + 1}-${i}`, seasonId, compId: id, round: r + 1, slot: rounds[r].slot, homeId: h, awayId: a, status: 'scheduled', seed: randomSeed() }),
      ),
    );

    // Copa: los 16 primeros de la temporada anterior
    const cupId = compId(seasonId, 'cup', lg.id);
    const seeding = input.ranked[lg.id].slice(0, 16);
    const cupRounds: RoundInfo[] = [
      { round: 1, label: 'Octavos', slot: slot(CUP_WEEKS.r16, DAY.cup), kind: 'single' },
      { round: 2, label: 'Cuartos', slot: slot(CUP_WEEKS.qf, DAY.cup), kind: 'single' },
      { round: 3, label: 'Semifinales', slot: slot(CUP_WEEKS.sf, DAY.cup), kind: 'single' },
      { round: 4, label: 'Final', slot: slot(CUP_WEEKS.final, DAY.cup), kind: 'final' },
    ];
    const cup: Competition = { id: cupId, seasonId, type: 'cup', leagueId: lg.id, name: CUP_NAMES[lg.id], teams: seeding, rounds: cupRounds, status: 'active', seeding };
    competitions.push(cup);
    // Sorteo puro de octavos; juega en casa el peor clasificado
    const drawn = rng.shuffle([...seeding]);
    for (let i = 0; i < 8; i++) {
      const [x, y] = [drawn[2 * i], drawn[2 * i + 1]];
      const [home, away] = seeding.indexOf(x) > seeding.indexOf(y) ? [x, y] : [y, x];
      matches.push({ id: `${cupId}-1-${i}`, seasonId, compId: cupId, round: 1, slot: cupRounds[0].slot, homeId: home, awayId: away, status: 'scheduled', seed: randomSeed(), knockout: true, bracket: i });
    }
  }

  // Competiciones europeas
  const { ucl, uel } = qualifyEurope(input);
  for (const [type, teams, name, day] of [['ucl', ucl, 'Champions League', DAY.ucl], ['uel', uel, 'Europa League', DAY.uel]] as const) {
    const id = compId(seasonId, type);
    const seeded = [...teams].sort((a, b) => input.teams.get(b)!.ovr - input.teams.get(a)!.ovr);
    const rounds = euroRounds(day);
    competitions.push({ id, seasonId, type, name, teams: seeded, rounds, status: 'active', seeding: seeded });
    const phase = swissLeaguePhase(seeded, (t) => input.teams.get(t)!.leagueId, rng);
    phase.forEach((round, r) =>
      round.forEach(([h, a], i) =>
        matches.push({ id: `${id}-${r + 1}-${i}`, seasonId, compId: id, round: r + 1, slot: rounds[r].slot, homeId: h, awayId: a, status: 'scheduled', seed: randomSeed() }),
      ),
    );
  }

  return { season: { id: seasonId, year, label: seasonLabel(year), status: 'active' }, competitions, matches };
}

function euroRounds(day: number): RoundInfo[] {
  const r: RoundInfo[] = EURO_WEEKS.league.map((w, i) => ({ round: i + 1, label: `Jornada ${i + 1}`, slot: slot(w, day), kind: 'league' }));
  const ko: [string, number[]][] = [['Playoff', EURO_WEEKS.playoff], ['Octavos', EURO_WEEKS.r16], ['Cuartos', EURO_WEEKS.qf], ['Semifinales', EURO_WEEKS.sf]];
  let n = 9;
  for (const [label, [w1, w2]] of ko) {
    r.push({ round: n++, label: `${label} (ida)`, slot: slot(w1, day), kind: 'leg1' });
    r.push({ round: n++, label: `${label} (vuelta)`, slot: slot(w2, day), kind: 'leg2' });
  }
  r.push({ round: n, label: 'Final', slot: slot(EURO_WEEKS.final, day === DAY.ucl ? 6 : 3), kind: 'final' });
  return r;
}

/** Reparte las plazas de Champions y Europa League según la configuración. */
export function qualifyEurope(input: Pick<SeasonInput, 'config' | 'ranked' | 'cupWinners' | 'leagues'>): { ucl: string[]; uel: string[] } {
  const { config, ranked, cupWinners } = input;
  const leagues = LEAGUE_ORDER.filter((l) => input.leagues.some((x) => x.id === l));
  const taken = new Set<string>();
  const next = new Map<LeagueId, number>(leagues.map((l) => [l, 0]));
  const takeFrom = (l: LeagueId): string | undefined => {
    const list = ranked[l];
    let i = next.get(l)!;
    while (i < list.length && taken.has(list[i])) i++;
    next.set(l, i + 1);
    const t = list[i];
    if (t) taken.add(t);
    return t;
  };
  const fill = (target: string[], size: number) => {
    let guard = 0;
    while (target.length < size && guard++ < 500) for (const l of leagues) if (target.length < size) {
      const t = takeFrom(l);
      if (t) target.push(t);
    }
  };
  const sizeFor = (n: number) => EURO_SIZES.find((s) => s >= n) ?? EURO_SIZES[EURO_SIZES.length - 1];

  const ucl: string[] = [];
  for (const l of leagues) for (let i = 0; i < config.zones[l].ucl; i++) {
    const t = takeFrom(l);
    if (t) ucl.push(t);
  }
  const uclSize = sizeFor(ucl.length);
  ucl.splice(uclSize);
  fill(ucl, uclSize);

  const uel: string[] = [];
  if (config.cupWinnerToUel)
    for (const l of leagues) {
      const w = cupWinners[l];
      if (w && !taken.has(w)) {
        taken.add(w);
        uel.push(w);
      }
    }
  for (const l of leagues) for (let i = 0; i < config.zones[l].uel; i++) {
    const t = takeFrom(l);
    if (t) uel.push(t);
  }
  const uelSize = sizeFor(uel.length);
  uel.splice(uelSize);
  fill(uel, uelSize);
  return { ucl, uel };
}

/** Orden inicial de cada liga para la primera temporada: puesto real de 2025/26, ascendidos al final por nivel. */
export function initialRanking(leagues: League[], teams: Map<string, Team>): Record<LeagueId, string[]> {
  const out = {} as Record<LeagueId, string[]>;
  for (const lg of leagues)
    out[lg.id] = [...lg.teams].sort((a, b) => {
      const ta = teams.get(a)!;
      const tb = teams.get(b)!;
      return (ta.previousPosition ?? 100 - ta.ovr / 10) - (tb.previousPosition ?? 100 - tb.ovr / 10);
    });
  return out;
}

// ---------------------------------------------------------------------------
// Eliminatorias: generar la ronda siguiente cuando termina una
// ---------------------------------------------------------------------------

export interface TieResult {
  bracket: number;
  winner: string;
  loser: string;
}

/** Ganador de cada eliminatoria de una ronda (partido único o ida/vuelta). Null si falta algún partido. */
export function roundWinners(comp: Competition, round: number, matches: Match[]): TieResult[] | null {
  const info = comp.rounds.find((r) => r.round === round)!;
  const decisive = matches.filter((m) => m.round === round);
  if (!decisive.length || decisive.some((m) => m.status !== 'played')) return null;
  if (info.kind === 'leg1') return null;
  return decisive
    .map((m) => {
      const side = m.winner ?? (m.score![0] >= m.score![1] ? 0 : 1);
      const winner = side === 0 ? m.homeId : m.awayId;
      return { bracket: m.bracket ?? 0, winner, loser: winner === m.homeId ? m.awayId : m.homeId };
    })
    .sort((a, b) => a.bracket - b.bracket);
}

/**
 * Crea los partidos de la siguiente ronda de una eliminatoria. `rank` decide quién es mejor
 * cabeza de serie (juega la vuelta en casa; en copa, juega en casa el peor).
 */
export function nextKnockoutMatches(comp: Competition, nextRound: number, pairs: [string, string, number][], rank: (t: string) => number): Match[] {
  const info = comp.rounds.find((r) => r.round === nextRound)!;
  const out: Match[] = [];
  for (const [x, y, bracket] of pairs) {
    const [better, worse] = rank(x) <= rank(y) ? [x, y] : [y, x];
    const base = { seasonId: comp.seasonId, compId: comp.id, status: 'scheduled' as const, bracket };
    if (info.kind === 'leg1') {
      const leg2 = comp.rounds.find((r) => r.round === nextRound + 1)!;
      const id1 = `${comp.id}-${nextRound}-${bracket}`;
      out.push({ ...base, id: id1, round: nextRound, slot: info.slot, homeId: worse, awayId: better, seed: randomSeed() });
      out.push({ ...base, id: `${comp.id}-${nextRound + 1}-${bracket}`, round: nextRound + 1, slot: leg2.slot, homeId: better, awayId: worse, seed: randomSeed(), knockout: true, firstLegId: id1 });
    } else if (info.kind === 'final') {
      out.push({ ...base, id: `${comp.id}-${nextRound}-${bracket}`, round: nextRound, slot: info.slot, homeId: better, awayId: worse, seed: randomSeed(), knockout: true, neutral: true });
    } else {
      // Copa a partido único: en casa el peor clasificado
      out.push({ ...base, id: `${comp.id}-${nextRound}-${bracket}`, round: nextRound, slot: info.slot, homeId: worse, awayId: better, seed: randomSeed(), knockout: true });
    }
  }
  return out;
}

/** Cruces de la ronda siguiente a partir de los ganadores (cuadro fijo). */
export function bracketPairs(winners: TieResult[], plan: 'adjacent' | 'fold'): [string, string, number][] {
  const w = [...winners].sort((a, b) => a.bracket - b.bracket).map((t) => t.winner);
  const out: [string, string, number][] = [];
  if (plan === 'adjacent') for (let i = 0; i < w.length / 2; i++) out.push([w[2 * i], w[2 * i + 1], i]);
  else for (let i = 0; i < w.length / 2; i++) out.push([w[i], w[w.length - 1 - i], i]);
  return out;
}
