// Comprueba que data/ratings/pace/<liga>.json tiene la velocidad de todos los jugadores de data/raw/<liga>.json.
// Uso: node scripts/validate-pace.mjs [liga ...]
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

export async function validatePace(leagueId) {
  const raw = JSON.parse(await readFile(path.join(ROOT, 'data', 'raw', `${leagueId}.json`), 'utf8'));
  const pace = JSON.parse(await readFile(path.join(ROOT, 'data', 'ratings', 'pace', `${leagueId}.json`), 'utf8'));
  const errors = [];
  for (const team of raw.teams) {
    const t = pace[team.code];
    if (!t) { errors.push(`${team.code}: falta el equipo`); continue; }
    for (const p of team.squad) {
      const v = t[p.name];
      if (v === undefined) errors.push(`${team.code}: falta "${p.name}"`);
      else if (!Number.isInteger(v) || v < 1 || v > 99) errors.push(`${team.code}: ${p.name} velocidad inválida (${v})`);
    }
    for (const name of Object.keys(t)) if (!team.squad.some((p) => p.name === name)) errors.push(`${team.code}: sobra "${name}"`);
  }
  return errors;
}

if (process.argv[1]?.endsWith('validate-pace.mjs')) {
  const leagues = process.argv.slice(2).length ? process.argv.slice(2) : ['eng', 'esp', 'ger', 'ita', 'fra', 'por'];
  let total = 0;
  for (const l of leagues) {
    let errors;
    try { errors = await validatePace(l); } catch (e) { errors = [String(e.message)]; }
    total += errors.length;
    console.log(`${l}: ${errors.length ? `${errors.length} errores` : 'OK'}`);
    for (const e of errors.slice(0, 30)) console.log('  - ' + e);
  }
  process.exit(total ? 1 : 0);
}
