import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, type ReactNode } from 'react';
import { db } from '../db/db';
import type { Config, League, Player, Season, Team } from '../game/types';

export interface WorldData {
  leagues: League[];
  teams: Map<string, Team>;
  players: Map<string, Player>;
  season: Season;
  config: Config;
}

const WorldCtx = createContext<WorldData | null>(null);

/** Datos base (ligas, equipos, jugadores, temporada actual y ajustes) que casi todas las pantallas necesitan. */
export function WorldProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const data = useLiveQuery(async () => {
    const [leagues, teams, players, seasonMeta, configMeta] = await Promise.all([
      db.leagues.toArray(),
      db.teams.toArray(),
      db.players.toArray(),
      db.meta.get('currentSeason'),
      db.meta.get('config'),
    ]);
    if (!seasonMeta || !configMeta) return null;
    const season = await db.seasons.get(seasonMeta.value as number);
    if (!season) return null;
    const order = ['eng', 'esp', 'ger', 'ita', 'fra', 'por'];
    return {
      leagues: leagues.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
      teams: new Map(teams.map((t) => [t.id, t])),
      players: new Map(players.map((p) => [p.id, p])),
      season,
      config: configMeta.value as Config,
    } satisfies WorldData;
  });
  if (!data) return <>{fallback}</>;
  return <WorldCtx.Provider value={data}>{children}</WorldCtx.Provider>;
}

export function useWorld(): WorldData {
  const w = useContext(WorldCtx);
  if (!w) throw new Error('useWorld fuera de WorldProvider');
  return w;
}
