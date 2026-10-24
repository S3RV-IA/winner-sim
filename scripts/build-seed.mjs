// Une data/raw + data/ratings en src/data/seed.json (lo que carga la app la primera vez).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LEAGUES } from './fetch-data.mjs';
import { PLAYER_FIELDS } from './validate-ratings.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Nombre en español y nombre corto para filas estrechas en el móvil. */
const NAMES = {
  'Bayern Munich': ['Bayern de Múnich', 'Bayern'],
  'Inter Milan': ['Inter de Milán', 'Inter'],
  'AC Milan': ['AC Milan', 'Milan'],
  'Atlético Madrid': ['Atlético de Madrid', 'Atlético'],
  'Athletic Bilbao': ['Athletic Club', 'Athletic'],
  'Celta Vigo': ['Celta de Vigo', 'Celta'],
  'Deportivo A Coruña': ['Deportivo de La Coruña', 'Deportivo'],
  'Racing Santander': ['Racing de Santander', 'Racing'],
  'Rayo Vallecano': ['Rayo Vallecano', 'Rayo'],
  'Real Sociedad': ['Real Sociedad', 'R. Sociedad'],
  'Marseille': ['Olympique de Marsella', 'Marsella'],
  'Lyon': ['Olympique de Lyon', 'Lyon'],
  'Monaco': ['AS Mónaco', 'Mónaco'],
  'Nice': ['OGC Niza', 'Niza'],
  'Strasbourg': ['Estrasburgo', 'Estrasburgo'],
  'Paris Saint-Germain': ['Paris Saint-Germain', 'PSG'],
  'Le Havre': ['Le Havre', 'Le Havre'],
  '1. FC Köln': ['FC Colonia', 'Colonia'],
  'Borussia Mönchengladbach': ['Borussia Mönchengladbach', 'Gladbach'],
  'Borussia Dortmund': ['Borussia Dortmund', 'Dortmund'],
  'Bayer Leverkusen': ['Bayer Leverkusen', 'Leverkusen'],
  'Eintracht Frankfurt': ['Eintracht Fráncfort', 'Eintracht'],
  'Hamburger SV': ['Hamburgo SV', 'Hamburgo'],
  'Werder Bremen': ['Werder Bremen', 'Werder'],
  'TSG Hoffenheim': ['TSG Hoffenheim', 'Hoffenheim'],
  'VfB Stuttgart': ['VfB Stuttgart', 'Stuttgart'],
  'SC Freiburg': ['SC Friburgo', 'Friburgo'],
  'FC Augsburg': ['FC Augsburgo', 'Augsburgo'],
  'SV Elversberg': ['SV Elversberg', 'Elversberg'],
  'SC Paderborn': ['SC Paderborn', 'Paderborn'],
  'Manchester City': ['Manchester City', 'Man City'],
  'Manchester United': ['Manchester United', 'Man United'],
  'Brighton & Hove Albion': ['Brighton & Hove Albion', 'Brighton'],
  'Tottenham Hotspur': ['Tottenham Hotspur', 'Tottenham'],
  'Nottingham Forest': ['Nottingham Forest', "Nott'm Forest"],
  'Newcastle United': ['Newcastle United', 'Newcastle'],
  'Crystal Palace': ['Crystal Palace', 'C. Palace'],
  'Sporting CP': ['Sporting de Portugal', 'Sporting'],
  'Vitória de Guimarães': ['Vitória de Guimarães', 'Vitória SC'],
  'Estrela da Amadora': ['Estrela da Amadora', 'Estrela'],
  'Académico de Viseu': ['Académico de Viseu', 'Ac. Viseu'],
  'Porto': ['FC Porto', 'Porto'],
  'Braga': ['SC Braga', 'Braga'],
  'Juventus': ['Juventus', 'Juventus'],
  'Roma': ['AS Roma', 'Roma'],
  'Napoli': ['SSC Napoli', 'Napoli'],
};

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = (s) => ascii(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const overrides = JSON.parse(await readFile(path.join(ROOT, 'data', 'overrides.json'), 'utf8'));
const identity = JSON.parse(await readFile(path.join(ROOT, 'data', 'identity.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Nivel de los equipos: histórico (base) + momento actual
// ---------------------------------------------------------------------------
/** Todas las valoraciones bajan este número de puntos (las diferencias, y por tanto las probabilidades, no cambian). */
const SHIFT = 5;
/** Peso del control frente a ataque y defensa en el motor (0,07 frente a 0,25, contando que afecta a ambos lados). */
export const CTL_W = 0.56;
const HIST_WEIGHT = 0.6;
const weighted = (v) => (v.att + v.def + CTL_W * v.ctl) / (2 + CTL_W);

/**
 * A partir del nivel actual (las valoraciones de data/ratings) calcula:
 *  - el reparto ataque/control/defensa según la identidad del club, sin cambiar su fuerza total;
 *  - el nivel histórico (60 % historia + 40 % nivel actual), que es lo que se guarda como base;
 *  - el momento del club = nivel actual − nivel histórico, para que hoy rinda exactamente como ahora.
 */
function teamLevels(id, r) {
  const c = { att: r.att - SHIFT, ctl: r.ctl - SHIFT, def: r.def - SHIFT };
  const level = weighted(c);
  const info = identity.teams[id] ?? {};
  let style;
  if (info.style) {
    const [att, ctl, def] = identity.styles[info.style];
    style = { att, ctl, def };
  } else {
    const mean = (c.att + c.ctl + c.def) / 3;
    style = { att: (c.att - mean) * 1.3, ctl: (c.ctl - mean) * 1.3, def: (c.def - mean) * 1.3 };
  }
  // Desplazamiento común para que el reparto mantenga el nivel ponderado
  const k = -(style.att + style.def + CTL_W * style.ctl) / (2 + CTL_W);
  const hist = info.hist ?? level;
  const historic = info.level ?? HIST_WEIGHT * hist + (1 - HIST_WEIGHT) * level;
  // `current` en identity.json fija a mano el nivel con el que juega hoy (sin tocar el histórico)
  const now = info.current ?? level;
  const current = { att: now + style.att + k, ctl: now + style.ctl + k, def: now + style.def + k };
  const gap = now - historic;
  const base = { att: Math.round(current.att - gap), ctl: Math.round(current.ctl - gap), def: Math.round(current.def - gap) };
  // El momento se calcula después de redondear para que el nivel con el que juega hoy no cambie
  const momentum = Math.round((now - weighted(base)) * 10) / 10;
  return { ...base, ovr: Math.round(weighted(base)), momentum };
}
const leagues = [];
const teams = [];
const players = [];

for (const lg of LEAGUES) {
  const raw = JSON.parse(await readFile(path.join(ROOT, 'data', 'raw', `${lg.id}.json`), 'utf8'));
  const ratings = JSON.parse(await readFile(path.join(ROOT, 'data', 'ratings', `${lg.id}.json`), 'utf8'));
  const pace = JSON.parse(await readFile(path.join(ROOT, 'data', 'ratings', 'pace', `${lg.id}.json`), 'utf8'));
  const teamIds = [];
  for (const t of raw.teams) {
    const r = ratings.teams[t.code];
    const id = `${lg.id}-${ascii(t.code)}`;
    const [name, short] = NAMES[t.name] ?? [t.name, t.name.length > 13 ? t.name.split(' ')[0] : t.name];
    const rows = new Map(r.players.map((p) => [p[0], p]));
    const used = new Set();
    let penaltyTaker = null;
    for (const p of t.squad) {
      const row = rows.get(p.name);
      let pid = `${id}-${slug(p.name)}`;
      while (used.has(pid)) pid += '-2';
      used.add(pid);
      if (p.name === r.penaltyTaker) penaltyTaker = pid;
      const attrs = Object.fromEntries(PLAYER_FIELDS.map((f, i) => [f, row[2 + i]]));
      attrs.pac = pace[t.code][p.name];
      Object.assign(attrs, overrides.players[`${id}|${p.name}`] ?? {});
      players.push({ id: pid, teamId: id, name: p.name, number: p.number, nat: p.nat, role: row[1], ...attrs });
    }
    teams.push({
      id, leagueId: lg.id, code: t.code, name, short, crest: t.crest,
      ...teamLevels(id, r), penaltyTaker,
      previousPosition: t.previousSeason?.pos ?? null,
    });
    teamIds.push(id);
  }
  leagues.push({ id: lg.id, name: lg.name, country: lg.country, teams: teamIds });
}

await writeFile(path.join(ROOT, 'src', 'data', 'seed.json'), JSON.stringify({ version: 11, season: '2026/27', leagues, teams, players }));
console.log(`seed.json: ${leagues.length} ligas, ${teams.length} equipos, ${players.length} jugadores`);
