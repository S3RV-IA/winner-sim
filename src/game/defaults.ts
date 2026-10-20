import { DEFAULT_SETTINGS } from '../engine/types';
import type { Config, LeagueId } from './types';

/** Orden de "coeficiente" para repartir plazas europeas sobrantes. */
export const LEAGUE_ORDER: LeagueId[] = ['eng', 'esp', 'ita', 'ger', 'fra', 'por'];

export const CUP_NAMES: Record<LeagueId, string> = {
  eng: 'FA Cup',
  esp: 'Copa del Rey',
  ger: 'DFB-Pokal',
  ita: 'Coppa Italia',
  fra: 'Coupe de France',
  por: 'Taça de Portugal',
};

export const DEFAULT_CONFIG: Config = {
  sim: DEFAULT_SETTINGS,
  zones: {
    eng: { ucl: 5, uel: 2, rel: 3 },
    esp: { ucl: 5, uel: 2, rel: 3 },
    ger: { ucl: 4, uel: 2, rel: 2 },
    ita: { ucl: 4, uel: 2, rel: 3 },
    fra: { ucl: 3, uel: 2, rel: 2 },
    por: { ucl: 3, uel: 2, rel: 2 },
  },
  cupWinnerToUel: true,
};

/** Tamaños válidos de la fase de liga europea. */
export const EURO_SIZES = [24, 32];
