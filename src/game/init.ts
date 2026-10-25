import { db } from '../db/db';
import seed from '../data/seed.json';
import { DEFAULT_CONFIG } from './defaults';
import { createSeason, initialRanking } from './season';
import { repairChampions } from './simulate';
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
    if (stored < SEED_VERSION) await migrateFromSeed(stored);
    // Una sola vez: corregir campeones de finales editadas antes de que se recalcularan
    if (!(await db.meta.get('championsChecked'))) {
      await repairChampions();
      await db.meta.put({ key: 'championsChecked', value: true });
    }
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
      { key: 'seedMomentum', value: seedMomentum() },
    ]);
  });
}

/** Foto del momento de cada club en la semilla, para que una actualización solo mueva lo que cambia. */
const seedMomentum = () => Object.fromEntries(seed.teams.map((t) => [t.id, t.momentum ?? 0]));

/** Momento en la semilla 6, que no guardaba la foto. Desde entonces solo ha cambiado el de estos clubes. */
const V6_MOMENTUM: Record<string, number> = {
  'eng-ars': 5.1, 'eng-che': -0.6, 'eng-liv': -1.6, 'eng-mci': 4.9, 'eng-mun': -6.3, 'ita-juv': -5.3, 'ita-mil': -4.6, 'fra-psg': 1.2, 'esp-rma': -0.6, 'esp-ath': -5.3,
};

/**
 * Partida ya empezada con datos antiguos: actualiza atributos de jugadores y niveles de equipos
 * (nivel histórico, identidad y momento) sin tocar la racha, temporadas, estadísticas ni palmarés.
 * El momento se mueve solo lo que cambia en la semilla, para conservar lo que cada club ha ganado o perdido temporada a temporada.
 */
async function migrateFromSeed(stored: number): Promise<void> {
  const seedPlayers = new Map(seed.players.map((p) => [p.id, p]));
  const seedTeams = new Map(seed.teams.map((t) => [t.id, t]));
  const snapshot = (await db.meta.get('seedMomentum'))?.value as Record<string, number> | undefined;
  const before = (id: string, now: number) => snapshot?.[id] ?? (stored === 6 ? (V6_MOMENTUM[id] ?? now) : undefined);
  const players = (await db.players.toArray()).map((p) => {
    const s = seedPlayers.get(p.id);
    return s ? { ...p, ...s, form: p.form } : p;
  }) as Player[];
  const teams = (await db.teams.toArray()).map((t) => {
    const s = seedTeams.get(t.id);
    if (!s) return t;
    const prev = before(t.id, s.momentum ?? 0);
    // Sin foto de la semilla anterior (partidas muy antiguas) se toma el momento de la semilla tal cual
    const momentum = prev === undefined ? s.momentum : Math.round(((t.momentum ?? 0) + (s.momentum ?? 0) - prev) * 10) / 10;
    return { ...t, att: s.att, ctl: s.ctl, def: s.def, ovr: s.ovr, momentum };
  }) as Team[];
  await db.transaction('rw', db.players, db.teams, db.meta, async () => {
    await db.players.bulkPut(players);
    await db.teams.bulkPut(teams);
    await db.meta.bulkPut([
      { key: 'seedVersion', value: SEED_VERSION },
      { key: 'seedMomentum', value: seedMomentum() },
    ]);
  });
}

/** Borra todo y empieza de cero. */
export async function resetGame(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await ensureGame();
}
