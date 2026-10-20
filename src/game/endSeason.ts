import { db, getConfig } from '../db/db';
import { seasonStartPlayerForm, seasonStartTeamForm } from '../engine/form';
import type { MatchEvent } from '../engine/types';
import { createSeason } from './season';
import { computeStandings } from './standings';
import { avgRating } from './stats';
import type { Award, AwardType, Competition, LeagueId, PlayerCompStats, PlayerSeason, StandingRow } from './types';

const TITLE_BONUS: Record<Competition['type'], number> = { league: 5, ucl: 9, uel: 3, cup: 2 };
const BOOT_FACTOR: Record<LeagueId, number> = { eng: 2, esp: 2, ger: 2, ita: 2, fra: 2, por: 1.5 };
const DEFENSIVE = new Set(['GK', 'CB', 'LB', 'RB']);

export async function canCloseSeason(seasonId: number) {
  const comps = await db.competitions.where('seasonId').equals(seasonId).toArray();
  return comps.length > 0 && comps.every((c) => c.status === 'finished');
}

/** Puntuación de rendimiento de una temporada: nota por encima de la media, goles, asistencias y títulos. */
function performanceScore(rows: PlayerCompStats[], titles: number, role: string) {
  let s = 0;
  for (const r of rows) {
    const goalWeight = r.compType === 'ucl' ? 0.8 : 0.55;
    s += r.ratingSum - r.rated * 6.7 + r.goals * goalWeight + r.assists * 0.4 + r.motm * 0.3;
    if (DEFENSIVE.has(role)) s += r.cleanSheets * 0.25;
  }
  return s + titles;
}

/** Cierra la temporada: premios, archivo, forma para la siguiente y crea la nueva temporada. */
export async function closeSeason(): Promise<number> {
  const config = await getConfig();
  const seasonId = (await db.meta.get('currentSeason'))!.value as number;
  const season = (await db.seasons.get(seasonId))!;
  if (!(await canCloseSeason(seasonId))) throw new Error('Aún quedan partidos por jugar');

  const leagues = await db.leagues.toArray();
  const teams = new Map((await db.teams.toArray()).map((t) => [t.id, t]));
  const players = new Map((await db.players.toArray()).map((p) => [p.id, p]));
  const comps = await db.competitions.where('seasonId').equals(seasonId).toArray();
  const stats = await db.stats.where('seasonId').equals(seasonId).toArray();
  const trophies = await db.trophies.where('seasonId').equals(seasonId).toArray();

  // 1) Clasificaciones finales
  const tables: Record<string, StandingRow[]> = {};
  for (const c of comps.filter((x) => x.type === 'league')) {
    const ms = await db.matches.where('compId').equals(c.id).toArray();
    tables[c.leagueId!] = computeStandings(c.teams, ms);
  }
  await db.archives.put({ seasonId, tables });

  // 2) Temporada de cada jugador (todas las competiciones)
  const byPlayer = new Map<string, PlayerCompStats[]>();
  for (const s of stats) byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s]);
  const playerSeasons: PlayerSeason[] = [];
  for (const [pid, rows] of byPlayer) {
    const sum = (k: keyof PlayerCompStats) => rows.reduce((a, r) => a + (r[k] as number), 0);
    const rated = sum('rated');
    playerSeasons.push({
      key: `${seasonId}|${pid}`, seasonId, playerId: pid, teamId: rows[0].teamId, apps: sum('apps'), goals: sum('goals'), assists: sum('assists'),
      minutes: sum('minutes'), avgRating: rated ? Math.round((sum('ratingSum') / rated) * 100) / 100 : 0, motm: sum('motm'),
    });
  }
  await db.playerSeasons.bulkPut(playerSeasons);

  // 3) Premios
  const titleBonus = (teamId: string) => trophies.filter((t) => t.teamId === teamId).reduce((a, t) => a + TITLE_BONUS[t.compType], 0);
  const awards: Award[] = [];
  const rank = (type: AwardType, entries: { playerId: string; value: number; detail?: string }[], leagueId?: LeagueId) => {
    const sorted = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
    if (!sorted.length) return;
    const withTeam = sorted.map((e) => ({ ...e, teamId: players.get(e.playerId)?.teamId ?? '', value: Math.round(e.value * 10) / 10 }));
    awards.push({ seasonId, type, leagueId, playerId: withTeam[0].playerId, teamId: withTeam[0].teamId, value: withTeam[0].value, ranking: withTeam });
  };

  const eligible = [...byPlayer.entries()].filter(([, rows]) => rows.reduce((a, r) => a + r.apps, 0) >= 20);
  rank('ballonDor', eligible.map(([pid, rows]) => {
    const p = players.get(pid)!;
    const g = rows.reduce((a, r) => a + r.goals, 0);
    const as = rows.reduce((a, r) => a + r.assists, 0);
    return { playerId: pid, value: performanceScore(rows, titleBonus(p.teamId), p.role), detail: `${g} goles · ${as} asist.` };
  }));

  const leagueComps = comps.filter((c) => c.type === 'league');
  rank('goldenBoot', stats.filter((s) => s.compType === 'league').map((s) => {
    const lg = leagueComps.find((c) => c.id === s.compId)!.leagueId!;
    return { playerId: s.playerId, value: s.goals * BOOT_FACTOR[lg], detail: `${s.goals} goles` };
  }));

  for (const c of leagueComps) {
    const rows = stats.filter((s) => s.compId === c.id);
    rank('leagueTopScorer', rows.map((s) => ({ playerId: s.playerId, value: s.goals })), c.leagueId);
    rank('leagueTopAssists', rows.map((s) => ({ playerId: s.playerId, value: s.assists })), c.leagueId);
    const games = Math.max(...rows.map((s) => s.apps), 1);
    rank('leagueMvp', rows.filter((s) => s.apps >= games * 0.5).map((s) => {
      const p = players.get(s.playerId)!;
      const title = c.championId === s.teamId ? 3 : 0;
      return { playerId: s.playerId, value: performanceScore([s], title, p.role), detail: `${avgRating(s).toFixed(2)} · ${s.goals} g · ${s.assists} a` };
    }), c.leagueId);
  }

  const ucl = comps.find((c) => c.type === 'ucl');
  if (ucl) {
    const rows = stats.filter((s) => s.compId === ucl.id);
    rank('uclTopScorer', rows.map((s) => ({ playerId: s.playerId, value: s.goals })));
    rank('uclMvp', rows.filter((s) => s.apps >= 6).map((s) => {
      const p = players.get(s.playerId)!;
      return { playerId: s.playerId, value: performanceScore([s], ucl.championId === s.teamId ? 4 : 0, p.role), detail: `${s.goals} g · ${s.assists} a` };
    }));
  }

  rank('bestGoalkeeper', eligible.filter(([pid]) => players.get(pid)?.role === 'GK').map(([pid, rows]) => {
    const rated = rows.reduce((a, r) => a + r.rated, 0);
    const avg = rated ? rows.reduce((a, r) => a + r.ratingSum, 0) / rated : 0;
    const cs = rows.reduce((a, r) => a + r.cleanSheets, 0);
    return { playerId: pid, value: avg * 10 + cs * 0.3, detail: `${avg.toFixed(2)} · ${cs} porterías a cero` };
  }));
  await db.awards.bulkAdd(awards);

  // 4) Forma de salida para la próxima temporada
  const europeWinners = new Set(trophies.filter((t) => t.compType === 'ucl' || t.compType === 'uel').map((t) => t.teamId));
  for (const lg of leagues) {
    const table = tables[lg.id];
    const z = config.zones[lg.id];
    table.forEach((row, i) => {
      const t = teams.get(row.teamId)!;
      t.form = seasonStartTeamForm({
        finalForm: t.form, position: i + 1, teams: table.length, championsUntil: z.ucl, europaUntil: z.ucl + z.uel, relegation: z.rel,
        wonEurope: europeWinners.has(t.id),
      });
    });
  }
  for (const p of players.values()) {
    const ps = playerSeasons.find((x) => x.playerId === p.id);
    p.form = ps ? seasonStartPlayerForm(ps.avgRating, ps.apps, p.ovr) : 0;
  }

  // 5) Compactar los partidos de la temporada (solo marcador, goles y expulsiones)
  const results = await db.results.where('seasonId').equals(seasonId).toArray();
  const keep = (e: MatchEvent) => e.t === 'goal' || (e.t === 'card' && e.color === 'R') || e.t === 'phase';
  for (const r of results) {
    r.events = r.events.filter(keep);
    r.players = r.players.filter((l) => l.goals || l.assists || l.id === r.mvp);
  }

  // 6) Nueva temporada
  const ranked = Object.fromEntries(leagues.map((lg) => [lg.id, tables[lg.id].map((r) => r.teamId)])) as Record<LeagueId, string[]>;
  const cupWinners = Object.fromEntries(comps.filter((c) => c.type === 'cup' && c.championId).map((c) => [c.leagueId, c.championId])) as Partial<Record<LeagueId, string>>;
  const next = createSeason({ seasonId: seasonId + 1, year: season.year + 1, leagues, teams, config, ranked, cupWinners });

  await db.transaction('rw', db.tables, async () => {
    await db.results.bulkPut(results);
    await db.teams.bulkPut([...teams.values()]);
    await db.players.bulkPut([...players.values()]);
    await db.seasons.put({ ...season, status: 'finished' });
    await db.seasons.put(next.season);
    await db.competitions.bulkPut(next.competitions);
    await db.matches.bulkPut(next.matches);
    await db.meta.put({ key: 'currentSeason', value: next.season.id });
  });
  return next.season.id;
}
