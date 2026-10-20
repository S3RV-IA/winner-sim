import type { MatchResult, PlayerLine } from '../engine/types';
import type { CompType, PlayerCompStats } from './types';

const SUMMED = [
  'minutes', 'goals', 'assists', 'shots', 'shotsOn', 'bigMissed', 'penGoals', 'penMissed', 'headGoals', 'outGoals', 'keyPasses',
  'dribbles', 'dribblesFailed', 'passes', 'passesOk', 'defActions', 'saves', 'conceded', 'yellow', 'red',
] as const satisfies readonly (keyof PlayerLine & keyof PlayerCompStats)[];

export function emptyStats(key: string, seasonId: number, compId: string, compType: CompType, playerId: string, teamId: string): PlayerCompStats {
  return {
    key, seasonId, compId, compType, playerId, teamId, apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOn: 0,
    bigMissed: 0, penGoals: 0, penMissed: 0, headGoals: 0, outGoals: 0, keyPasses: 0, dribbles: 0, dribblesFailed: 0, passes: 0,
    passesOk: 0, defActions: 0, saves: 0, conceded: 0, cleanSheets: 0, yellow: 0, red: 0, ratingSum: 0, rated: 0, motm: 0,
  };
}

/** Suma (sign = 1) o resta (sign = −1) las líneas de un partido a las estadísticas acumuladas. */
export function applyLine(s: PlayerCompStats, line: PlayerLine, result: MatchResult, sign: 1 | -1) {
  s.apps += sign;
  if (line.starter) s.starts += sign;
  for (const k of SUMMED) s[k] += sign * line[k];
  if (line.rating > 0) {
    s.ratingSum = Math.round((s.ratingSum + sign * line.rating) * 10) / 10;
    s.rated += sign;
  }
  const keeperOrDefender = line.role === 'GK' || line.role === 'CB' || line.role === 'LB' || line.role === 'RB';
  if (keeperOrDefender && line.conceded === 0 && line.minutes >= 60) s.cleanSheets += sign;
  if (result.mvp === line.id) s.motm += sign;
}

export const avgRating = (s: Pick<PlayerCompStats, 'ratingSum' | 'rated'>) => (s.rated ? s.ratingSum / s.rated : 0);
