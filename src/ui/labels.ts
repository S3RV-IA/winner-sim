import type { ShotKind } from '../engine/types';
import { CUP_NAMES, SUPERCUP_NAMES } from '../game/defaults';
import type { AwardType, CompType, LeagueId } from '../game/types';

// Textos y colores compartidos por varias pantallas (aquí, y no en las pantallas,
// para que ninguna pantalla tenga que importar a otra).

export const COMP_COLORS: Record<CompType, string> = {
  league: '#ffb300',
  cup: '#10b981',
  supercup: '#8b5cf6',
  ucl: '#1d4ed8',
  uel: '#f97316',
  uecl: '#0d9488',
  uefasuper: '#0ea5e9',
};

export const FLAGS: Record<LeagueId, string> = { eng: '🏴', esp: '🇪🇸', ger: '🇩🇪', ita: '🇮🇹', fra: '🇫🇷', por: '🇵🇹' };

export const AWARD_NAMES: Record<AwardType, string> = {
  ballonDor: 'Balón de Oro',
  goldenBoot: 'Bota de Oro',
  leagueMvp: 'Mejor jugador de la liga',
  leagueTopScorer: 'Máximo goleador de la liga',
  leagueTopAssists: 'Máximo asistente de la liga',
  uclMvp: 'Mejor jugador de la Champions',
  uclTopScorer: 'Máximo goleador de la Champions',
  bestGoalkeeper: 'Mejor portero',
};

export const COMP_TROPHY_LABEL: Record<CompType, string> = {
  ucl: 'Champions League',
  league: 'Ligas',
  cup: 'Copas',
  uel: 'Europa League',
  uecl: 'Conference League',
  supercup: 'Supercopas',
  uefasuper: 'Supercopas de Europa',
};

/** Títulos europeos con muro de campeones propio (los nacionales van por liga: `league-esp`, `cup-esp`, `supercup-esp`). */
export const EURO_TITLES: Record<'ucl' | 'uel' | 'uecl' | 'uefasuper', string> = {
  ucl: 'Champions League',
  uel: 'Europa League',
  uecl: 'Conference League',
  uefasuper: 'Supercopa de Europa',
};

/** Qué título es una clave de muro de campeones (`ucl`, `league-esp`, `cup-ita`…). */
export function titleInfo(key: string, leagueName: (id: LeagueId) => string): { type: CompType; leagueId?: LeagueId; name: string } {
  if (key in EURO_TITLES) return { type: key as CompType, name: EURO_TITLES[key as keyof typeof EURO_TITLES] };
  const [type, leagueId] = key.split('-') as ['league' | 'cup' | 'supercup', LeagueId];
  const name = type === 'cup' ? CUP_NAMES[leagueId] : type === 'supercup' ? SUPERCUP_NAMES[leagueId] : leagueName(leagueId);
  return { type, leagueId, name };
}

export const KIND_LABEL: Record<ShotKind, string> = { pen: 'de penalti', big: '', head: 'de cabeza', box: '', out: 'desde fuera del área' };

export const minuteLabel = (e: { min: number; plus?: number }) => `${e.min}${e.plus ? `+${e.plus}` : ''}'`;
