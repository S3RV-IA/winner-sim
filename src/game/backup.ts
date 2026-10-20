import { db } from '../db/db';

/** Copia completa de la partida en JSON. */
export async function exportBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {};
  for (const t of db.tables) tables[t.name] = await t.toArray();
  return new Blob([JSON.stringify({ app: 'winner-sim', version: 1, exportedAt: new Date().toISOString(), tables })], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text());
  if (data?.app !== 'winner-sim' || !data.tables) throw new Error('El archivo no es una copia de Winner Sim');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear();
      const rows = data.tables[t.name];
      if (Array.isArray(rows) && rows.length) await t.bulkAdd(rows);
    }
  });
}

/** Pide al navegador que no borre los datos (Safari puede limpiar el almacenamiento de webs no instaladas). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
