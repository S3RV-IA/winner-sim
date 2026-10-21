import type { ShotKind } from '../engine/types';
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

export const KIND_LABEL: Record<ShotKind, string> = { pen: 'de penalti', big: '', head: 'de cabeza', box: '', out: 'desde fuera del área' };

export const minuteLabel = (e: { min: number; plus?: number }) => `${e.min}${e.plus ? `+${e.plus}` : ''}'`;
