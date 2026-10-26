import { db } from '../db/db';
import { roundWinners } from './season';
import { computeStandings } from './standings';
import type { Competition } from './types';

/** Podio de una competición terminada. En eliminatorias, el tercer puesto lo comparten los dos semifinalistas. */
export interface Podium {
  seasonId: number;
  first?: string;
  second?: string;
  third: string[];
}

export async function podiumOf(comp: Competition): Promise<Podium> {
  const first = comp.championId;
  const second = comp.runnerUpId;
  const matches = await db.matches.where('compId').equals(comp.id).toArray();
  let third: string[] = [];
  if (comp.type === 'league') {
    // Tercero: el mejor clasificado que no es ni campeón ni subcampeón (cuenta también si hubo sanción)
    const next = computeStandings(comp.teams, matches).find((r) => r.teamId !== first && r.teamId !== second);
    if (next) third = [next.teamId];
  } else if (comp.rounds.length >= 2) {
    // Perdedores de semifinales: la ronda anterior a la final (la vuelta en las eliminatorias a doble partido)
    const semis = comp.rounds[comp.rounds.length - 2];
    if (semis.kind !== 'league') third = (roundWinners(comp, semis.round, matches) ?? []).map((r) => r.loser);
  }
  return { seasonId: comp.seasonId, first, second, third };
}
