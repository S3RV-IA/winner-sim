import type { MatchResult, PlayerAttrs, Role, SimSettings } from '../engine/types';

export type LeagueId = 'eng' | 'esp' | 'ger' | 'ita' | 'fra' | 'por';
export type CompType = 'league' | 'cup' | 'ucl' | 'uel';

export interface League {
  id: LeagueId;
  name: string;
  country: string;
  teams: string[];
}

export interface Team {
  id: string;
  leagueId: LeagueId;
  code: string;
  name: string;
  short: string;
  crest: string | null;
  ovr: number;
  att: number;
  ctl: number;
  def: number;
  penaltyTaker: string | null;
  previousPosition: number | null;
  form: number;
}

export interface Player extends PlayerAttrs {
  id: string;
  teamId: string;
  name: string;
  number: number | null;
  nat: string;
  role: Role;
  form: number;
}

export interface Zones {
  ucl: number;
  uel: number;
  rel: number;
}

export interface Config {
  sim: SimSettings;
  zones: Record<LeagueId, Zones>;
  /** El campeón de copa juega la Europa League. */
  cupWinnerToUel: boolean;
}

export interface Season {
  id: number;
  year: number;
  label: string;
  status: 'active' | 'finished';
}

export interface RoundInfo {
  round: number;
  label: string;
  slot: number;
  /** liga/fase de liga, ida, vuelta, partido único o final */
  kind: 'league' | 'leg1' | 'leg2' | 'single' | 'final';
}

export interface Competition {
  id: string;
  seasonId: number;
  type: CompType;
  leagueId?: LeagueId;
  name: string;
  teams: string[];
  rounds: RoundInfo[];
  status: 'active' | 'finished';
  championId?: string;
  runnerUpId?: string;
  /** Orden de cabezas de serie (copa: puesto de la temporada anterior). */
  seeding?: string[];
}

export interface Match {
  id: string;
  seasonId: number;
  compId: string;
  round: number;
  slot: number;
  homeId: string;
  awayId: string;
  status: 'scheduled' | 'played';
  seed: number;
  neutral?: boolean;
  /** Partido único con prórroga/penaltis, o vuelta de una eliminatoria. */
  knockout?: boolean;
  /** Posición en el cuadro (eliminatorias). */
  bracket?: number;
  /** En la vuelta: id de la ida. */
  firstLegId?: string;
  /** Marcador final (tras la prórroga si la hubo). El detalle está en la tabla `results`. */
  score?: [number, number];
  penalties?: [number, number];
  extraTime?: boolean;
  /** Ganador: 0 local, 1 visitante, null empate. En la vuelta tiene en cuenta la ida. */
  winner?: 0 | 1 | null;
  manual?: boolean;
  /** Orden en que se jugó (para la forma reciente). */
  playedOrder?: number;
}

/** Detalle completo de un partido jugado (eventos, estadísticas y notas). */
export interface StoredResult extends MatchResult {
  id: string;
  seasonId: number;
}

/** Copia en el partido los datos ligeros del resultado. */
export function summarize(m: Match, r: MatchResult) {
  m.score = r.score;
  m.penalties = r.penalties?.score;
  m.extraTime = r.extraTime || undefined;
  m.winner = r.winner;
}

/** Estadísticas acumuladas de un jugador en una competición. */
export interface PlayerCompStats {
  key: string; // `${compId}|${playerId}`
  seasonId: number;
  compId: string;
  compType: CompType;
  playerId: string;
  teamId: string;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOn: number;
  bigMissed: number;
  penGoals: number;
  penMissed: number;
  headGoals: number;
  outGoals: number;
  keyPasses: number;
  dribbles: number;
  dribblesFailed: number;
  passes: number;
  passesOk: number;
  defActions: number;
  saves: number;
  conceded: number;
  cleanSheets: number;
  yellow: number;
  red: number;
  ratingSum: number;
  rated: number;
  motm: number;
}

export interface Trophy {
  id?: number;
  seasonId: number;
  teamId: string;
  compType: CompType;
  compId: string;
  compName: string;
}

export type AwardType = 'ballonDor' | 'goldenBoot' | 'leagueMvp' | 'leagueTopScorer' | 'leagueTopAssists' | 'uclMvp' | 'uclTopScorer' | 'bestGoalkeeper';

export interface Award {
  id?: number;
  seasonId: number;
  type: AwardType;
  leagueId?: LeagueId;
  playerId: string;
  teamId: string;
  value: number;
  /** Clasificación completa (top 10) para mostrar. */
  ranking?: { playerId: string; teamId: string; value: number; detail?: string }[];
}

/** Resumen permanente de una temporada (clasificaciones finales y temporada de cada jugador). */
export interface SeasonArchive {
  seasonId: number;
  tables: Record<string, StandingRow[]>;
}

export interface PlayerSeason {
  key: string; // `${seasonId}|${playerId}`
  seasonId: number;
  playerId: string;
  teamId: string;
  apps: number;
  goals: number;
  assists: number;
  minutes: number;
  avgRating: number;
  motm: number;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  /** Últimos resultados, del más antiguo al más reciente. */
  last: ('W' | 'D' | 'L')[];
}
