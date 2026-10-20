import { db } from '../db/db';
import { play, type PlayReport } from '../game/simulate';
import type { Competition } from '../game/types';

async function pendingCount(seasonId: number, maxSlot: number) {
  return db.matches.where('status').equals('scheduled').filter((m) => m.seasonId === seasonId && m.slot <= maxSlot).count();
}

type Progress = (n: number, total?: number) => void;

export function describe(report: PlayReport, label: string) {
  const extra = report.others ? ` · también ${report.others} de otras competiciones` : '';
  const champs = report.finished.length ? ` · ¡${report.finished.map((c) => c.name).join(', ')} terminada!` : '';
  return `${label}: ${report.played - report.others} partidos${extra}${champs}`;
}

/** Juega una jornada/ronda (y antes, todo lo pendiente del calendario). */
export async function playRound(comp: Competition, round: number, progress: Progress) {
  const info = comp.rounds.find((r) => r.round === round)!;
  const total = await pendingCount(comp.seasonId, info.slot);
  return play({ maxSlot: info.slot, focusCompId: comp.id, onProgress: (n) => progress(n, total) });
}

/** Juega hasta que termine la competición. */
export async function playCompetition(comp: Competition, progress: Progress) {
  const last = comp.rounds[comp.rounds.length - 1].slot;
  const total = await pendingCount(comp.seasonId, last);
  return play({ maxSlot: last, focusCompId: comp.id, onProgress: (n) => progress(n, total) });
}

/** Juega la siguiente fecha del calendario (todas las competiciones). */
export async function playNextDate(seasonId: number, progress: Progress) {
  const next = await db.matches.where('status').equals('scheduled').filter((m) => m.seasonId === seasonId).toArray();
  if (!next.length) return null;
  const slot = Math.min(...next.map((m) => m.slot));
  return play({ maxSlot: slot, onProgress: (n) => progress(n) });
}

export async function playSeason(seasonId: number, progress: Progress) {
  // + rondas eliminatorias que se crean sobre la marcha (copas y Europa)
  const total = (await pendingCount(seasonId, Number.POSITIVE_INFINITY)) + 132;
  return play({ onProgress: (n) => progress(n, total) });
}

export async function playOne(matchId: string) {
  return play({ matchIds: [matchId] });
}
