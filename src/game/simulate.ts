import { db, getConfig } from '../db/db';
import { nextPlayerForm, nextTeamForm } from '../engine/form';
import { simulateMatch } from '../engine/match';
import type { MatchOptions, MatchResult, SimTeam } from '../engine/types';
import { applyLine, emptyStats } from './stats';
import { bracketPairs, nextKnockoutMatches, roundWinners } from './season';
import { computeStandings } from './standings';
import { currentOvr, currentRatings } from './level';
import { matchBoosts } from './traits';
import { summarize, type Competition, type Match, type Player, type PlayerCompStats, type StoredResult, type Team } from './types';

/** Equipos y jugadores en memoria durante una tanda de simulación. */
class World {
  teams = new Map<string, Team>();
  players = new Map<string, Player>();
  byTeam = new Map<string, Player[]>();
  dirtyTeams = new Set<string>();
  dirtyPlayers = new Set<string>();

  static async load(): Promise<World> {
    const w = new World();
    for (const t of await db.teams.toArray()) w.teams.set(t.id, t);
    for (const p of await db.players.toArray()) {
      w.players.set(p.id, p);
      const list = w.byTeam.get(p.teamId) ?? [];
      list.push(p);
      w.byTeam.set(p.teamId, list);
    }
    return w;
  }

  /** Equipos listos para el motor, con sus rasgos históricos evaluados para este partido. */
  pair(m: Match, comp: Competition, leg1: Match | undefined, useTraits: boolean): [SimTeam, SimTeam] {
    const home = this.sim(m.homeId);
    const away = this.sim(m.awayId);
    if (!useTraits) return [home, away];
    [home.boost, away.boost] = matchBoosts(m, comp, leg1, (id) => currentOvr(this.teams.get(id)!));
    return [home, away];
  }

  sim(teamId: string): SimTeam {
    const t = this.teams.get(teamId)!;
    const now = currentRatings(t);
    return {
      id: t.id, name: t.name, short: t.short, att: now.att, ctl: now.ctl, def: now.def, form: t.form, penaltyTaker: t.penaltyTaker ?? undefined,
      players: (this.byTeam.get(teamId) ?? []).map((p) => ({ ...p })),
    };
  }

  async flush() {
    await db.teams.bulkPut([...this.dirtyTeams].map((id) => this.teams.get(id)!));
    await db.players.bulkPut([...this.dirtyPlayers].map((id) => this.players.get(id)!));
    this.dirtyTeams.clear();
    this.dirtyPlayers.clear();
  }
}

async function nextOrder(): Promise<number> {
  // Solo para cambios sueltos; play() lleva su propio contador
  const n = ((await db.meta.get('playOrder'))?.value as number | undefined) ?? 0;
  await db.meta.put({ key: 'playOrder', value: n + 1 });
  return n + 1;
}

async function matchOptions(m: Match, forcedScore?: [number, number]): Promise<MatchOptions> {
  const opts: MatchOptions = { neutral: m.neutral, knockout: m.knockout, forcedScore };
  if (m.firstLegId) {
    const leg1 = await db.matches.get(m.firstLegId);
    if (leg1?.score) opts.firstLeg = [leg1.score[1], leg1.score[0]];
  }
  return opts;
}

/** Actualiza la forma de equipos y jugadores tras un partido. */
function applyForm(world: World, m: Match, r: MatchResult) {
  const [hg, ag] = r.score;
  const pts = hg > ag ? [3, 0] : hg < ag ? [0, 3] : [1, 1];
  const home = world.teams.get(m.homeId)!;
  const away = world.teams.get(m.awayId)!;
  home.form = nextTeamForm(home.form, r.odds, pts[0]);
  away.form = nextTeamForm(away.form, [r.odds[2], r.odds[1], r.odds[0]], pts[1]);
  world.dirtyTeams.add(home.id).add(away.id);
  for (const line of r.players) {
    if (line.rating <= 0) continue;
    const p = world.players.get(line.id);
    if (!p) continue;
    p.form = nextPlayerForm(p.form, line.rating, p.ovr);
    world.dirtyPlayers.add(p.id);
  }
}

/** Suma o resta las líneas del partido a las estadísticas de la competición. */
async function applyStats(m: Match, comp: Competition, r: MatchResult, world: World, sign: 1 | -1, cache?: Map<string, PlayerCompStats>) {
  const keys = r.players.map((l) => `${comp.id}|${l.id}`);
  const missing = cache ? keys.filter((k) => !cache.has(k)) : keys;
  const loaded = await db.stats.bulkGet(missing);
  const local = cache ?? new Map<string, PlayerCompStats>();
  missing.forEach((k, i) => {
    const s = loaded[i];
    if (s) local.set(k, s);
  });
  for (const line of r.players) {
    const key = `${comp.id}|${line.id}`;
    let s = local.get(key);
    if (!s) {
      const teamId = line.side === 0 ? m.homeId : m.awayId;
      s = emptyStats(key, m.seasonId, comp.id, comp.type, line.id, world.players.get(line.id)?.teamId ?? teamId);
      local.set(key, s);
    }
    applyLine(s, line, r, sign);
  }
  if (!cache) await db.stats.bulkPut(keys.map((k) => local.get(k)!));
  return keys;
}

/** Cede el hilo sin depender de setTimeout (que el navegador ralentiza en segundo plano). */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') return void setTimeout(resolve, 0);
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}

export interface PlayReport {
  played: number;
  /** Partidos jugados de otras competiciones para mantener el orden del calendario. */
  others: number;
  finished: Competition[];
}

/**
 * Juega en orden cronológico todos los partidos pendientes hasta `maxSlot` (incluido),
 * o solo los partidos indicados. Genera las rondas siguientes de las eliminatorias.
 * Todo se hace en memoria y se guarda una vez por fecha del calendario.
 */
export async function play(opts: { maxSlot?: number; matchIds?: string[]; focusCompId?: string; onProgress?: (n: number) => void }): Promise<PlayReport> {
  const config = await getConfig();
  const seasonId = (await db.meta.get('currentSeason'))!.value as number;
  const world = await World.load();
  const comps = new Map((await db.competitions.where('seasonId').equals(seasonId).toArray()).map((c) => [c.id, c]));
  const ids = opts.matchIds ? new Set(opts.matchIds) : null;
  const maxSlot = opts.maxSlot ?? Number.POSITIVE_INFINITY;
  const report: PlayReport = { played: 0, others: 0, finished: [] };

  const pending = (await db.matches.where('status').equals('scheduled').toArray()).filter((m) => m.seasonId === seasonId);
  const stats = new Map((await db.stats.where('seasonId').equals(seasonId).toArray()).map((s) => [s.key, s]));
  const playedNow = new Map<string, Match>();
  let order = ((await db.meta.get('playOrder'))?.value as number | undefined) ?? 0;
  const wanted = (m: Match) => (ids ? ids.has(m.id) : m.slot <= maxSlot);
  const allDirtyStats = new Set<string>();
  let groups = 0;
  let lastYield = performance.now();
  const flushBulk = async () => {
    await db.transaction('rw', [db.stats, db.teams, db.players, db.meta], async () => {
      await db.stats.bulkPut([...allDirtyStats].map((k) => stats.get(k)!));
      await world.flush();
      await db.meta.put({ key: 'playOrder', value: order });
    });
    allDirtyStats.clear();
  };

  for (let guard = 0; guard < 1000; guard++) {
    const candidates = pending.filter(wanted);
    if (!candidates.length) break;
    const minSlot = Math.min(...candidates.map((m) => m.slot));
    const group = candidates.filter((m) => m.slot === minSlot);
    const dirtyStats = new Set<string>();
    const touched = new Set<string>();
    const results: StoredResult[] = [];
    for (const m of group) {
      const comp = comps.get(m.compId)!;
      const matchOpts: MatchOptions = { neutral: m.neutral, knockout: m.knockout };
      const leg1 = m.firstLegId ? playedNow.get(m.firstLegId) ?? (await db.matches.get(m.firstLegId)) : undefined;
      if (leg1?.score) matchOpts.firstLeg = [leg1.score[1], leg1.score[0]];
      const [home, away] = world.pair(m, comp, leg1, config.traits !== false);
      const r = simulateMatch(home, away, config.sim, matchOpts, m.seed);
      m.status = 'played';
      summarize(m, r);
      results.push({ ...r, id: m.id, seasonId });
      m.playedOrder = ++order;
      playedNow.set(m.id, m);
      applyForm(world, m, r);
      for (const line of r.players) {
        const key = `${comp.id}|${line.id}`;
        let st = stats.get(key);
        if (!st) {
          st = emptyStats(key, seasonId, comp.id, comp.type, line.id, world.players.get(line.id)?.teamId ?? (line.side === 0 ? m.homeId : m.awayId));
          stats.set(key, st);
        }
        applyLine(st, line, r, 1);
        dirtyStats.add(key);
      }
      touched.add(m.compId);
      report.played++;
      if (opts.focusCompId && m.compId !== opts.focusCompId) report.others++;
    }
    const groupIds = new Set(group.map((m) => m.id));
    for (let i = pending.length - 1; i >= 0; i--) if (groupIds.has(pending[i].id)) pending.splice(i, 1);

    // Los partidos se guardan en cada fecha (las eliminatorias los necesitan para avanzar);
    // estadísticas y forma, que son miles de filas, se guardan en bloque cada pocas fechas.
    await db.transaction('rw', [db.matches, db.results], async () => {
      await db.matches.bulkPut(group);
      await db.results.bulkPut(results);
    });
    for (const k of dirtyStats) allDirtyStats.add(k);
    if (++groups % 12 === 0) await flushBulk();

    // Solo hace falta mirar el progreso cuando una competición se queda sin partidos pendientes
    for (const id of touched) {
      if (pending.some((m) => m.compId === id)) continue;
      const { finished, created } = await advanceCompetition(comps.get(id)!);
      if (finished) report.finished.push(finished);
      pending.push(...created);
    }
    // Ceder el hilo de vez en cuando para que la interfaz pinte el progreso
    if (performance.now() - lastYield > 120) {
      opts.onProgress?.(report.played);
      await yieldToUi();
      lastYield = performance.now();
    }
  }
  await flushBulk();
  opts.onProgress?.(report.played);
  return report;
}

/** Introduce (o cambia) el resultado de un partido a mano; el motor rellena goleadores y estadísticas. */
export async function setManualResult(matchId: string, score: [number, number]) {
  const config = await getConfig();
  const m = (await db.matches.get(matchId))!;
  const comp = (await db.competitions.get(m.compId))!;
  await assertSeasonOpen(m);
  if (m.status === 'played' && (await hasLaterRound(comp, m))) throw new Error('Esta eliminatoria ya tiene rondas posteriores');
  await reopen(comp);
  const world = await World.load();
  const old = m.status === 'played' ? await db.results.get(m.id) : undefined;
  if (old) await applyStats(m, comp, old, world, -1);
  const leg1 = m.firstLegId ? await db.matches.get(m.firstLegId) : undefined;
  const [home, away] = world.pair(m, comp, leg1, config.traits !== false);
  const r = simulateMatch(home, away, config.sim, await matchOptions(m, score), m.seed + 1);
  m.status = 'played';
  summarize(m, r);
  m.manual = true;
  m.playedOrder ??= await nextOrder();
  applyForm(world, m, r);
  await applyStats(m, comp, r, world, 1);
  await db.matches.put(m);
  await db.results.put({ ...r, id: m.id, seasonId: m.seasonId });
  await world.flush();
  await advanceCompetition(comp);
}

/** Deshace un partido jugado (vuelve a pendiente). */
export async function resetMatch(matchId: string) {
  const m = (await db.matches.get(matchId))!;
  const comp = (await db.competitions.get(m.compId))!;
  const old = await db.results.get(m.id);
  if (m.status !== 'played' || !old) return;
  await assertSeasonOpen(m);
  if (await hasLaterRound(comp, m)) throw new Error('Esta eliminatoria ya tiene rondas posteriores');
  const world = await World.load();
  await applyStats(m, comp, old, world, -1);
  m.status = 'scheduled';
  m.score = m.penalties = m.extraTime = m.winner = m.manual = undefined;
  await db.matches.put(m);
  await db.results.delete(m.id);
  await reopen(comp);
}

/** Una temporada cerrada ya repartió premios, plazas europeas y estadísticas: sus partidos no se pueden cambiar. */
async function assertSeasonOpen(m: Match) {
  if ((await db.seasons.get(m.seasonId))?.status === 'finished') throw new Error('La temporada ya está cerrada: sus resultados no se pueden cambiar');
}

/** Si la competición ya había terminado, la reabre sin campeón ni trofeo para que el partido cambiado vuelva a decidir quién gana. */
async function reopen(comp: Competition) {
  if (comp.status !== 'finished') return;
  comp.status = 'active';
  comp.championId = comp.runnerUpId = comp.sanction = undefined;
  await db.competitions.put(comp);
  await db.trophies.where('seasonId').equals(comp.seasonId).filter((t) => t.compId === comp.id).delete();
}

/**
 * Corrige campeones que no cuadran con sus partidos (partidas en las que se editó una final o la última
 * jornada antes de que el cambio de resultado recalculara el campeón).
 */
export async function repairChampions(): Promise<number> {
  // Las competiciones con un título retirado por sanción tienen a propósito un campeón distinto al del campo
  const comps = await db.competitions.filter((c) => c.status === 'finished' && !c.sanction).toArray();
  let fixed = 0;
  for (const comp of comps) {
    const matches = await db.matches.where('compId').equals(comp.id).toArray();
    let champion: string | undefined;
    let runnerUp: string | undefined;
    if (comp.type === 'league') {
      const table = computeStandings(comp.teams, matches);
      [champion, runnerUp] = [table[0]?.teamId, table[1]?.teamId];
    } else {
      const res = roundWinners(comp, comp.rounds[comp.rounds.length - 1].round, matches);
      [champion, runnerUp] = [res?.[0]?.winner, res?.[0]?.loser];
    }
    if (!champion || (champion === comp.championId && runnerUp === comp.runnerUpId)) continue;
    await db.competitions.update(comp.id, { championId: champion, runnerUpId: runnerUp });
    await db.trophies.where('seasonId').equals(comp.seasonId).filter((t) => t.compId === comp.id).modify({ teamId: champion });
    fixed++;
  }
  return fixed;
}

/** En eliminatorias no se puede cambiar un partido si ya existe (o se ha jugado) lo que depende de él. */
async function hasLaterRound(comp: Competition, m: Match) {
  if (comp.type === 'league') return false;
  const isLeg1 = comp.rounds.find((r) => r.round === m.round)?.kind === 'leg1';
  const leg2Id = isLeg1 ? `${comp.id}-${m.round + 1}-${m.bracket}` : null;
  const later = await db.matches
    .where('compId')
    .equals(comp.id)
    .filter((x) => x.round > m.round && (x.id !== leg2Id || x.status === 'played'))
    .count();
  return later > 0;
}

// ---------------------------------------------------------------------------
// Progreso de competiciones
// ---------------------------------------------------------------------------

async function finish(comp: Competition, championId: string, runnerUpId: string) {
  comp.status = 'finished';
  comp.championId = championId;
  comp.runnerUpId = runnerUpId;
  await db.competitions.put(comp);
  await db.trophies.add({ seasonId: comp.seasonId, teamId: championId, compType: comp.type, compId: comp.id, compName: comp.name });
}

/** Comprueba si una competición avanza de ronda o termina. Devuelve la competición si acaba de terminar. */
export async function advanceCompetition(comp: Competition): Promise<{ finished: Competition | null; created: Match[] }> {
  const none = { finished: null, created: [] };
  if (comp.status === 'finished') return none;
  const matches = await db.matches.where('compId').equals(comp.id).toArray();

  if (comp.type === 'league') {
    if (matches.some((m) => m.status !== 'played')) return none;
    const table = computeStandings(comp.teams, matches);
    await finish(comp, table[0].teamId, table[1].teamId);
    return { finished: comp, created: [] };
  }

  const maxRound = Math.max(...matches.map((m) => m.round));
  const last = comp.rounds[comp.rounds.length - 1];
  if (maxRound === last.round) {
    const res = roundWinners(comp, last.round, matches);
    if (!res) return none;
    await finish(comp, res[0].winner, res[0].loser);
    return { finished: comp, created: [] };
  }

  const info = comp.rounds.find((r) => r.round === maxRound)!;
  if (matches.some((m) => m.round === maxRound && m.status !== 'played')) return none;

  let newMatches: Match[] = [];
  if (comp.type !== 'ucl' && comp.type !== 'uel') {
    // Copas, supercopas y Conference: cuadro fijo (la ida espera a la vuelta)
    if (info.kind === 'leg1') return none;
    const res = roundWinners(comp, maxRound, matches)!;
    const seeding = comp.seeding ?? comp.teams;
    newMatches = nextKnockoutMatches(comp, maxRound + 1, bracketPairs(res, 'adjacent'), (t) => seeding.indexOf(t));
  } else if (info.kind === 'league') {
    // Fin de la fase de liga europea → playoff (9.º–24.º)
    if (maxRound < 8) return none;
    const table = computeStandings(comp.teams, matches.filter((m) => m.round <= 8));
    const pos = (t: string) => table.findIndex((r) => r.teamId === t);
    comp.seeding = table.map((r) => r.teamId);
    await db.competitions.put(comp);
    const pairs: [string, string, number][] = [];
    for (let k = 1; k <= 8; k++) pairs.push([table[8 + k - 1].teamId, table[25 - k - 1].teamId, k - 1]);
    newMatches = nextKnockoutMatches(comp, 9, pairs, pos);
  } else if (info.kind === 'leg2') {
    const res = roundWinners(comp, maxRound, matches)!;
    const seeding = comp.seeding ?? comp.teams;
    const pos = (t: string) => seeding.indexOf(t);
    let pairs: [string, string, number][];
    if (maxRound === 10) {
      // Octavos: k.º de la fase de liga contra el ganador del playoff (17−k) vs (8+k)
      const byBracket = new Map(res.map((r) => [r.bracket, r.winner]));
      pairs = Array.from({ length: 8 }, (_, i) => [seeding[i], byBracket.get(7 - i)!, i] as [string, string, number]);
    } else if (maxRound === 16) pairs = bracketPairs(res, 'adjacent');
    else pairs = bracketPairs(res, 'fold');
    newMatches = nextKnockoutMatches(comp, maxRound + 1, pairs, pos);
  }
  if (newMatches.length) await db.matches.bulkPut(newMatches);
  return { finished: null, created: newMatches };
}

