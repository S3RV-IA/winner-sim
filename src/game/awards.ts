import type { CompType, LeagueId, PlayerCompStats } from './types';

/** Hasta dónde llegó un equipo en cada competición. */
export interface TeamHonors {
  ucl?: 'win' | 'final' | 'semi' | 'quarter';
  uel?: 'win' | 'final' | 'semi';
  league?: 'win' | 'second';
  cup?: 'win' | 'final';
}

/** Puntos por título o ronda alcanzada: la Champions es lo que más pesa, como en una votación real. */
const HONOR_POINTS = {
  ucl: { win: 32, final: 14, semi: 7, quarter: 3 },
  uel: { win: 12, final: 5, semi: 2 },
  league: { win: 14, second: 3 },
  cup: { win: 5, final: 1.5 },
} as const;

/** La Liga Portugal pesa algo menos que las cinco grandes. */
const LEAGUE_WEIGHT: Record<LeagueId, number> = { eng: 1, esp: 1, ger: 1, ita: 1, fra: 1, por: 0.6 };
const GOAL_WEIGHT: Record<CompType, number> = { league: 1, ucl: 1.5, uel: 0.8, cup: 0.6 };
const DEFENSIVE = new Set(['GK', 'CB', 'LB', 'RB']);

export interface ScoreInput {
  rows: PlayerCompStats[];
  role: string;
  leagueId: LeagueId;
  honors: TeamHonors;
  /** Partidos que jugó su equipo en cada competición (para medir lo importante que fue el jugador). */
  teamGames: Map<string, number>;
}

export interface ScoreBreakdown {
  total: number;
  individual: number;
  titles: number;
  /** Texto corto con lo más destacado (para mostrar en el ranking). */
  detail: string;
}

/**
 * Puntuación del Balón de Oro: rendimiento individual + títulos.
 * Los títulos solo cuentan del todo si el jugador fue importante (≥ 65 % de los minutos de su equipo en esa competición).
 */
export function ballonDorScore({ rows, role, leagueId, honors, teamGames }: ScoreInput): ScoreBreakdown {
  let goals = 0;
  let individual = 0;
  let ratingSum = 0;
  let rated = 0;
  let apps = 0;
  const involvement = new Map<CompType, number>();
  for (const r of rows) {
    const w = GOAL_WEIGHT[r.compType] * (r.compType === 'league' ? LEAGUE_WEIGHT[leagueId] : 1);
    individual += r.goals * w + r.assists * 0.6 * w + r.motm * 0.4;
    if (DEFENSIVE.has(role)) individual += r.cleanSheets * 0.6;
    goals += r.goals;
    ratingSum += r.ratingSum;
    rated += r.rated;
    apps += r.apps;
    const games = teamGames.get(r.compId) ?? 0;
    // Parte de los minutos de su equipo: por debajo del 20 % no cuenta, desde el 65 % cuenta entero
    const share = games ? r.minutes / (games * 90) : 0;
    involvement.set(r.compType, Math.min(1, Math.max(0, (share - 0.2) / 0.45)));
  }
  // Nota media por encima de lo normal, ponderada por cuánto ha jugado
  // (la nota ya incluye los goles, por eso pesa moderadamente: así no se cuentan dos veces)
  const avg = rated ? ratingSum / rated : 0;
  individual += Math.max(0, avg - 6.8) * 12 * Math.min(1, apps / 45);

  let titles = 0;
  const won: string[] = [];
  const add = (type: CompType, points: number, label?: string) => {
    titles += points * (involvement.get(type) ?? 0);
    if (label && (involvement.get(type) ?? 0) > 0.3) won.push(label);
  };
  if (honors.ucl) add('ucl', HONOR_POINTS.ucl[honors.ucl], honors.ucl === 'win' ? 'Champions' : undefined);
  if (honors.uel) add('uel', HONOR_POINTS.uel[honors.uel], honors.uel === 'win' ? 'Europa League' : undefined);
  if (honors.league) add('league', HONOR_POINTS.league[honors.league] * LEAGUE_WEIGHT[leagueId], honors.league === 'win' ? 'Liga' : undefined);
  if (honors.cup) add('cup', HONOR_POINTS.cup[honors.cup], honors.cup === 'win' ? 'Copa' : undefined);

  const assists = rows.reduce((a, r) => a + r.assists, 0);
  const detail = [`${goals} goles · ${assists} asist.`, ...won].join(' · ');
  return { total: individual + titles, individual, titles, detail };
}
