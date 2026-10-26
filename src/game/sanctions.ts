import { db } from '../db/db';

/**
 * Retira títulos a un club por sanción: cada uno pasa al subcampeón de esa competición
 * (segundo de la liga o finalista). Devuelve cuántos se han retirado.
 */
export async function stripTitles(trophyIds: number[], reason: string): Promise<number> {
  let stripped = 0;
  await db.transaction('rw', db.trophies, db.competitions, async () => {
    for (const id of trophyIds) {
      const t = await db.trophies.get(id);
      const comp = t && (await db.competitions.get(t.compId));
      if (!t || !comp?.runnerUpId || t.bySanction) continue;
      await db.competitions.update(comp.id, { championId: comp.runnerUpId, runnerUpId: t.teamId, sanction: { teamId: t.teamId, reason } });
      await db.trophies.update(id, { teamId: comp.runnerUpId, bySanction: { teamId: t.teamId, reason } });
      stripped++;
    }
  });
  return stripped;
}

/** Deshace una sanción: el título vuelve al club que lo ganó en el campo. */
export async function restoreTitle(trophyId: number): Promise<void> {
  await db.transaction('rw', db.trophies, db.competitions, async () => {
    const t = await db.trophies.get(trophyId);
    if (!t?.bySanction) return;
    const original = t.bySanction.teamId;
    await db.competitions.update(t.compId, { championId: original, runnerUpId: t.teamId, sanction: undefined });
    await db.trophies.update(trophyId, { teamId: original, bySanction: undefined });
  });
}
