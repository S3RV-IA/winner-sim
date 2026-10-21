export type Role = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';

export interface PlayerAttrs {
  ovr: number;
  fin: number; // definición dentro del área
  lng: number; // disparo lejano
  hea: number; // cabeza / juego aéreo
  dri: number; // regate
  pas: number; // precisión de pase
  cre: number; // creación / visión
  def: number; // defensa
  gk: number; // portería
}

export interface SimPlayer extends PlayerAttrs {
  id: string;
  name: string;
  number: number | null;
  role: Role;
  /** Estado de forma −1..1 */
  form: number;
}

export interface SimTeam {
  id: string;
  name: string;
  short: string;
  att: number;
  ctl: number;
  def: number;
  /** Estado de forma −1..1 */
  form: number;
  players: SimPlayer[];
  penaltyTaker?: string;
}

export interface SimSettings {
  /** Desviación del "factor del día" (0 = sin sorpresas). */
  randomness: number;
  /** Multiplicador de goles en casa (y divisor fuera). */
  homeAdvantage: number;
  /** Puntos de nivel que suma/resta la forma máxima (±). */
  formImpact: number;
}

export const DEFAULT_SETTINGS: SimSettings = { randomness: 0.18, homeAdvantage: 1.13, formImpact: 3 };

export interface MatchOptions {
  /** Partido en campo neutral (finales). */
  neutral?: boolean;
  /** Si hay empate al 90', prórroga y penaltis (eliminatorias a partido único). */
  knockout?: boolean;
  /** Para la vuelta de una eliminatoria: goles de la ida [local de este partido, visitante de este partido]. */
  firstLeg?: [number, number];
  /** Resultado forzado (introducido a mano): el motor solo rellena los detalles. */
  forcedScore?: [number, number];
}

export type Side = 0 | 1; // 0 = local, 1 = visitante

export type ShotKind = 'pen' | 'big' | 'head' | 'box' | 'out';
export type ShotOutcome = 'goal' | 'saved' | 'off' | 'blocked' | 'post';

/** `min` es el minuto reglamentario (45, 90, 105, 120 como máximo de cada parte) y `plus` el añadido. */
interface At {
  min: number;
  plus?: number;
}

export type MatchEvent =
  | (At & { t: 'goal'; side: Side; player: string; assist?: string; kind: ShotKind; score: [number, number] })
  | (At & { t: 'miss'; side: Side; player: string; kind: ShotKind; outcome: Exclude<ShotOutcome, 'goal'>; keeper?: string })
  | (At & { t: 'card'; side: Side; player: string; color: 'Y' | 'R' })
  | (At & { t: 'sub'; side: Side; out: string; in: string })
  | (At & { t: 'phase'; label: 'HT' | 'FT' | 'ET' | 'AET' | 'PENS' });

export interface PenaltyKick {
  side: Side;
  player: string;
  scored: boolean;
}

/** Estadísticas de un jugador en un partido. */
export interface PlayerLine {
  id: string;
  side: Side;
  role: Role;
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOn: number;
  shotsOff: number;
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
  /** Tiros rivales bloqueados (los de ocasión clara cuentan más en la nota). */
  blocks: number;
  saves: number;
  conceded: number;
  yellow: number;
  red: number;
  rating: number;
}

export interface TeamLine {
  goals: number;
  xg: number;
  possession: number;
  shots: number;
  shotsOn: number;
  bigChances: number;
  passes: number;
  passesOk: number;
  dribbles: number;
  corners: number;
  yellow: number;
  red: number;
  saves: number;
}

export interface MatchResult {
  score: [number, number];
  /** Resultado tras la prórroga si la hubo (incluido en score). */
  extraTime: boolean;
  penalties?: { score: [number, number]; kicks: PenaltyKick[] };
  /** 0 local, 1 visitante, null empate (solo ligas). */
  winner: Side | null;
  events: MatchEvent[];
  teams: [TeamLine, TeamLine];
  players: PlayerLine[];
  /** Id del mejor jugador del partido. */
  mvp: string;
  /** Probabilidades previas al partido [local, empate, visitante] (para la forma). */
  odds: [number, number, number];
  expectedGoals: [number, number];
}
