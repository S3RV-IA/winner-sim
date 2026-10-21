import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { canCloseSeason, closeSeason } from './endSeason';
import { ensureGame } from './init';
import { play } from './simulate';
import { computeStandings } from './standings';

describe('temporada completa', () => {
  beforeAll(async () => {
    await ensureGame();
  });

  it('crea ligas, copas, supercopas y competiciones europeas con su calendario', async () => {
    const comps = await db.competitions.where('seasonId').equals(1).toArray();
    expect(comps.filter((c) => c.type === 'league')).toHaveLength(6);
    expect(comps.filter((c) => c.type === 'cup')).toHaveLength(6);
    expect(comps.filter((c) => c.type === 'supercup')).toHaveLength(6);
    // Primera temporada: no hay campeones europeos previos, así que no hay Supercopa de Europa
    expect(comps.filter((c) => c.type === 'uefasuper')).toHaveLength(0);
    const uecl = comps.find((c) => c.type === 'uecl')!;
    expect(uecl.teams).toHaveLength(16);
    const sce = comps.find((c) => c.id === '1-supercup-esp')!;
    expect(sce.teams).toHaveLength(4);
    expect(comps.find((c) => c.id === '1-supercup-eng')!.teams).toHaveLength(2);
    const ucl = comps.find((c) => c.type === 'ucl')!;
    const uel = comps.find((c) => c.type === 'uel')!;
    expect(ucl.teams).toHaveLength(24);
    expect(uel.teams).toHaveLength(24);
    expect(new Set([...ucl.teams, ...uel.teams, ...uecl.teams]).size).toBe(64);
    // Cada equipo europeo juega 8 partidos de fase de liga, 4 en casa
    const ms = await db.matches.where('compId').equals(ucl.id).toArray();
    for (const t of ucl.teams) {
      expect(ms.filter((m) => m.homeId === t || m.awayId === t)).toHaveLength(8);
      expect(ms.filter((m) => m.homeId === t)).toHaveLength(4);
    }
    // Liga: 38 jornadas de 10 partidos en LaLiga, cada equipo contra todos dos veces
    const esp = await db.matches.where('compId').equals('1-league-esp').toArray();
    expect(esp).toHaveLength(380);
  });

  it('simula la temporada entera y la cierra con campeones y premios', async () => {
    const report = await play({});
    expect(report.played).toBeGreaterThan(2400);
    const comps = await db.competitions.where('seasonId').equals(1).toArray();
    for (const c of comps) expect(c.status, c.name).toBe('finished');
    expect(await canCloseSeason(1)).toBe(true);

    const trophies = await db.trophies.where('seasonId').equals(1).toArray();
    expect(trophies).toHaveLength(21);

    const esp = comps.find((c) => c.id === '1-league-esp')!;
    const table = computeStandings(esp.teams, await db.matches.where('compId').equals(esp.id).toArray());
    expect(table[0].played).toBe(38);
    expect(esp.championId).toBe(table[0].teamId);

    const next = await closeSeason();
    expect(next).toBe(2);
    const awards = await db.awards.where('seasonId').equals(1).toArray();
    expect(awards.find((a) => a.type === 'ballonDor')).toBeTruthy();
    expect(awards.filter((a) => a.type === 'leagueTopScorer')).toHaveLength(6);
    const comps2 = await db.competitions.where('seasonId').equals(2).toArray();
    expect(comps2).toHaveLength(22);
    // Supercopa de Europa: campeón de Champions contra campeón de Europa League
    const sce2 = comps2.find((c) => c.type === 'uefasuper')!;
    expect(sce2.teams).toEqual([comps.find((c) => c.type === 'ucl')!.championId, comps.find((c) => c.type === 'uel')!.championId]);
    // Supercopa de España: campeón y subcampeón de liga + campeón y finalista de copa
    const cupEsp = comps.find((c) => c.id === '1-cup-esp')!;
    const sup2 = comps2.find((c) => c.id === '2-supercup-esp')!;
    for (const t of [table[0].teamId, table[1].teamId, cupEsp.championId!, cupEsp.runnerUpId!]) expect(sup2.teams).toContain(t);
    // La copa de la temporada 2 la juegan los 16 primeros de la liga
    const cup = comps2.find((c) => c.id === '2-cup-esp')!;
    expect(cup.teams).toEqual(table.slice(0, 16).map((r) => r.teamId));

    const ballon = awards.find((a) => a.type === 'ballonDor')!;
    const players = new Map((await db.players.toArray()).map((p) => [p.id, p]));
    const teams = new Map((await db.teams.toArray()).map((t) => [t.id, t]));
    const name = (id: string) => players.get(id)?.name;
    console.log('Balón de Oro:', ballon.ranking!.slice(0, 10).map((r) => `${name(r.playerId)} (${teams.get(r.teamId)?.short}) ${r.value} ${r.detail}`).join(' | '));
    for (const c of comps) console.log(`${c.name}: ${teams.get(c.championId!)?.name} (sub: ${teams.get(c.runnerUpId!)?.short})`);
    for (const a of awards.filter((x) => x.type === 'leagueTopScorer')) console.log(`Pichichi ${a.leagueId}: ${name(a.playerId)} ${a.value}`);
  });
});
