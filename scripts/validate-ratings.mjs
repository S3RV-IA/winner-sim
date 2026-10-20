// Comprueba que data/ratings/<liga>.json cubre todos los equipos y jugadores de data/raw/<liga>.json
// con valores válidos. Uso: node scripts/validate-ratings.mjs [liga ...]
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
export const ROLES = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
// Orden de los atributos numéricos en cada fila de jugador (después de nombre y rol)
export const PLAYER_FIELDS = ['ovr', 'fin', 'lng', 'hea', 'dri', 'pas', 'cre', 'def', 'gk'];

const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export async function validate(leagueId) {
  const raw = JSON.parse(await readFile(path.join(ROOT, 'data', 'raw', `${leagueId}.json`), 'utf8'));
  const ratings = JSON.parse(await readFile(path.join(ROOT, 'data', 'ratings', `${leagueId}.json`), 'utf8'));
  const errors = [];
  for (const team of raw.teams) {
    const r = ratings.teams?.[team.code];
    if (!r) { errors.push(`${team.code}: falta el equipo`); continue; }
    for (const k of ['ovr', 'att', 'ctl', 'def']) if (!inRange(r[k], 1, 100)) errors.push(`${team.code}: ${k} inválido (${r[k]})`);
    const rows = new Map((r.players ?? []).map((p) => [p[0], p]));
    for (const p of team.squad) {
      const row = rows.get(p.name);
      if (!row) { errors.push(`${team.code}: falta jugador "${p.name}"`); continue; }
      if (!ROLES.includes(row[1])) errors.push(`${team.code}: rol inválido para ${p.name} (${row[1]})`);
      if (row.length !== 2 + PLAYER_FIELDS.length) errors.push(`${team.code}: ${p.name} tiene ${row.length} columnas`);
      PLAYER_FIELDS.forEach((f, i) => { if (!inRange(row[2 + i], 1, 99)) errors.push(`${team.code}: ${p.name} ${f} inválido (${row[2 + i]})`); });
      if ((p.pos === 'GK') !== (row[1] === 'GK')) errors.push(`${team.code}: ${p.name} pos Wikipedia ${p.pos} vs rol ${row[1]}`);
    }
    for (const name of rows.keys()) if (!team.squad.some((p) => p.name === name)) errors.push(`${team.code}: jugador sobrante "${name}"`);
    if (r.penaltyTaker && !rows.has(r.penaltyTaker)) errors.push(`${team.code}: penaltyTaker "${r.penaltyTaker}" no está en la plantilla`);
  }
  return errors;
}

if (process.argv[1]?.endsWith('validate-ratings.mjs')) {
  const leagues = process.argv.slice(2).length ? process.argv.slice(2) : ['eng', 'esp', 'ger', 'ita', 'fra', 'por'];
  let total = 0;
  for (const l of leagues) {
    let errors;
    try { errors = await validate(l); } catch (e) { errors = [String(e.message)]; }
    total += errors.length;
    console.log(`${l}: ${errors.length ? `${errors.length} errores` : 'OK'}`);
    for (const e of errors.slice(0, 40)) console.log('  - ' + e);
  }
  process.exit(total ? 1 : 0);
}
