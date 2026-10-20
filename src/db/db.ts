import Dexie, { type Table } from 'dexie';
import type {
  Award, Competition, Config, League, Match, Player, PlayerCompStats, PlayerSeason, Season, SeasonArchive, StoredResult, Team, Trophy,
} from '../game/types';

export interface Meta {
  key: string;
  value: unknown;
}

export class WinnerDB extends Dexie {
  meta!: Table<Meta, string>;
  leagues!: Table<League, string>;
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  seasons!: Table<Season, number>;
  competitions!: Table<Competition, string>;
  matches!: Table<Match, string>;
  results!: Table<StoredResult, string>;
  stats!: Table<PlayerCompStats, string>;
  trophies!: Table<Trophy, number>;
  awards!: Table<Award, number>;
  archives!: Table<SeasonArchive, number>;
  playerSeasons!: Table<PlayerSeason, string>;

  constructor(name = 'winner-sim') {
    super(name);
    this.version(1).stores({
      meta: 'key',
      leagues: 'id',
      teams: 'id, leagueId',
      players: 'id, teamId',
      seasons: 'id',
      competitions: 'id, seasonId',
      matches: 'id, seasonId, compId, [compId+round], slot, status, homeId, awayId',
      results: 'id, seasonId',
      stats: 'key, seasonId, compId, playerId, teamId',
      trophies: '++id, seasonId, teamId',
      awards: '++id, seasonId, type, playerId',
      archives: 'seasonId',
      playerSeasons: 'key, seasonId, playerId, goals, assists',
    });
  }
}

export const db = new WinnerDB();

export async function getConfig(): Promise<Config> {
  return (await db.meta.get('config'))!.value as Config;
}

export async function getCurrentSeason(): Promise<Season | undefined> {
  const id = (await db.meta.get('currentSeason'))?.value as number | undefined;
  return id === undefined ? undefined : db.seasons.get(id);
}
