import type { ShotKind } from '../engine/types';
import type { AwardType, CompType, LeagueId } from '../game/types';

// Textos y colores compartidos por varias pantallas (aquí, y no en las pantallas,
// para que ninguna pantalla tenga que importar a otra).

export const COMP_COLORS: Record<CompType, string> = { league: '#ffb300', cup: '#10b981', ucl: '#1d4ed8', uel: '#f97316' };

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

export const COMP_TROPHY_LABEL: Record<CompType, string> = { league: 'Ligas', ucl: 'Champions League', uel: 'Europa League', cup: 'Copas' };

export const KIND_LABEL: Record<ShotKind, string> = { pen: 'de penalti', big: '', head: 'de cabeza', box: '', out: 'desde fuera del área' };

export const minuteLabel = (e: { min: number; plus?: number }) => `${e.min}${e.plus ? `+${e.plus}` : ''}'`;
