import { db } from '../db/db';
import seed from '../data/seed.json';
import { DEFAULT_CONFIG } from './defaults';
import { createSeason, initialRanking } from './season';
import type { League, Player, Team } from './types';

export const SEED_VERSION = seed.version;

let starting: Promise<void> | null = null;

/** Primera ejecución: carga ligas, equipos y jugadores y crea la temporada 2026/27. */
export function ensureGame(): Promise<void> {
  starting ??= createIfMissing().finally(() => (starting = null));
  return starting;
}

async function createIfMissing(): Promise<void> {
  const stored = (await db.meta.get('seedVersion'))?.value as number | undefined;
  if (stored !== undefined) {
    if (stored < SEED_VERSION) await migrateFromSeed();
    return;
  }
  const leagues = seed.leagues as League[];
  const teams = seed.teams.map((t) => ({ ...t, form: 0 })) as Team[];
  const players = seed.players.map((p) => ({ ...p, form: 0 })) as Player[];
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const bundle = createSeason({
    seasonId: 1,
    year: 2026,
    leagues,
    teams: teamMap,
    config: DEFAULT_CONFIG,
    ranked: initialRanking(leagues, teamMap),
    cupWinners: {},
  });
  await db.transaction('rw', db.tables, async () => {
    await db.leagues.bulkPut(leagues);
    await db.teams.bulkPut(teams);
    await db.players.bulkPut(players);
    await db.seasons.put(bundle.season);
    await db.competitions.bulkPut(bundle.competitions);
    await db.matches.bulkPut(bundle.matches);
    await db.meta.bulkPut([
      { key: 'config', value: DEFAULT_CONFIG },
      { key: 'currentSeason', value: 1 },
      { key: 'playOrder', value: 0 },
      { key: 'seedVersion', value: SEED_VERSION },
    ]);
  });
}

/**
 * Partida ya empezada con datos antiguos: actualiza atributos de jugadores y niveles de equipos
 * (nivel histórico, identidad y momento) sin tocar la racha, temporadas, estadísticas ni palmarés.
 */
async function migrateFromSeed(): Promise<void> {
  const seedPlayers = new Map(seed.players.map((p) => [p.id, p]));
  const seedTeams = new Map(seed.teams.map((t) => [t.id, t]));
  const players = (await db.players.toArray()).map((p) => {
    const s = seedPlayers.get(p.id);
    return s ? { ...p, ...s, form: p.form } : p;
  }) as Player[];
  const teams = (await db.teams.toArray()).map((t) => {
    const s = seedTeams.get(t.id);
    return s ? { ...t, att: s.att, ctl: s.ctl, def: s.def, ovr: s.ovr, momentum: s.momentum } : t;
  }) as Team[];
  await db.transaction('rw', db.players, db.teams, db.meta, async () => {
    await db.players.bulkPut(players);
    await db.teams.bulkPut(teams);
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION });
  });
}

/** Borra todo y empieza de cero. */
export async function resetGame(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await ensureGame();
}
