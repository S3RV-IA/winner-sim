import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { weekOf } from '../game/calendar';
import type { Player } from '../game/types';

/** Semana del calendario en la que va la temporada (la del próximo partido pendiente). */
export function useCurrentWeek(seasonId: number): number {
  const next = useLiveQuery(
    () => db.matches.orderBy('slot').filter((m) => m.status === 'scheduled' && m.seasonId === seasonId).first(),
    [seasonId],
  );
  return next ? weekOf(next.slot) : Number.POSITIVE_INFINITY;
}

/** Semanas de baja que le quedan a un jugador (0 si está disponible). */
export function injuryWeeksLeft(p: Player, seasonId: number, week: number): number {
  if (!p.injury || p.injury.seasonId !== seasonId || !Number.isFinite(week)) return 0;
  return Math.max(0, p.injury.untilWeek - week);
}
