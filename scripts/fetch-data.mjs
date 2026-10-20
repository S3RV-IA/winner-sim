// Descarga equipos, plantillas, escudos y la clasificación de la temporada anterior desde Wikipedia.
// Uso: node scripts/fetch-data.mjs [codigoLiga ...]
// Salida: data/raw/<liga>.json y public/crests/<liga>-<codigo>.png
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UA = 'WinnerSimPersonal/0.1 (personal non-commercial project)';
const SEASON = '2026–27';
const PREV_SEASON = '2025–26';

export const LEAGUES = [
  { id: 'eng', name: 'Premier League', wiki: 'Premier League', country: 'Inglaterra' },
  { id: 'esp', name: 'LaLiga', wiki: 'La Liga', country: 'España' },
  { id: 'ger', name: 'Bundesliga', wiki: 'Bundesliga', country: 'Alemania' },
  { id: 'ita', name: 'Serie A', wiki: 'Serie A', country: 'Italia' },
  { id: 'fra', name: 'Ligue 1', wiki: 'Ligue 1', country: 'Francia' },
  { id: 'por', name: 'Liga Portugal', wiki: 'Primeira Liga', country: 'Portugal' },
];

const asciiCode = (code) => code.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    if (res.ok) {
      const data = await res.json();
      if (data.error?.code !== 'maxlag') return data;
    }
    const wait = Number(res.headers.get('retry-after')) * 1000 || 5000 * (attempt + 1);
    console.warn(`  · Wikipedia ${res.status}, reintento en ${Math.round(wait / 1000)} s`);
    await sleep(wait);
  }
  throw new Error(`Wikipedia API falló: ${url}`);
}

async function wikitext(page) {
  const data = await api({ action: 'parse', page, prop: 'wikitext', redirects: '1' });
  if (data.error) return null;
  return { title: data.parse.title, text: data.parse.wikitext };
}

/** Wikitext de muchas páginas en una sola petición por lote. Devuelve Map(tituloPedido -> {title, text}). */
async function wikitextMany(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const data = await api({ action: 'query', prop: 'revisions|pageprops', rvprop: 'content', rvslots: 'main', ppprop: 'page_image', titles: batch.join('|'), redirects: '1' });
    const alias = new Map();
    for (const n of data.query.normalized ?? []) alias.set(n.to, n.from);
    for (const r of data.query.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    for (const pg of data.query.pages) {
      const asked = alias.get(pg.title) ?? pg.title;
      out.set(asked, { title: pg.title, text: pg.revisions?.[0]?.slots?.main?.content ?? '', pageImage: pg.pageprops?.page_image ?? null });
    }
    await sleep(1000);
  }
  return out;
}

/** Resuelve redirecciones: Map(tituloPedido -> tituloFinal). */
async function resolveTitles(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const data = await api({ action: 'query', titles: titles.slice(i, i + 50).join('|'), redirects: '1' });
    const alias = new Map();
    for (const n of data.query.normalized ?? []) alias.set(n.to, n.from);
    for (const r of data.query.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    for (const pg of data.query.pages) out.set(alias.get(pg.title) ?? pg.title, pg.title);
  }
  return out;
}

/** Logo del infobox del club, como respaldo cuando la página no define page_image. */
function infoboxImage(text) {
  const m = text.match(/\|\s*image\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n<]+\.(?:svg|png|jpg|gif))/i);
  return m ? m[1].trim() : null;
}

/** URLs de miniatura (128 px) para muchos archivos en una sola petición por lote. */
async function thumbUrls(files) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const data = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '128', titles: batch.map((f) => `File:${f}`).join('|') });
    const alias = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const pg of data.query.pages) {
      const asked = (alias.get(pg.title) ?? pg.title).replace(/^File:/, '');
      const url = pg.imageinfo?.[0]?.thumburl;
      if (url) out.set(asked, url);
      out.set(pg.title.replace(/^File:/, ''), url);
    }
    await sleep(1000);
  }
  return out;
}

/** Texto de la tabla Module:Sports table, que puede estar en la página o en una plantilla transcluida. */
async function sportsTableText(season, wikiLeague) {
  const page = await wikitext(`${season} ${wikiLeague}`);
  if (!page) throw new Error(`No existe la página ${season} ${wikiLeague}`);
  const tpl = page.text.match(new RegExp(`\\{\\{(${season} ${wikiLeague} table)[|}]`));
  if (tpl) {
    const t = await wikitext(`Template:${tpl[1]}`);
    if (t) return t.text;
  }
  return page.text;
}

const stripLink = (s) => {
  const m = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  return m ? { target: m[1].trim(), label: (m[2] ?? m[1]).replace(/\{\{nowrap\|([^}]*)\}\}/g, '$1').replace(/<br\s*\/?>/g, ' ').trim() } : null;
};

/** Devuelve los equipos (código, nombre, página del club) y, si existen, sus números de la tabla. */
function parseSportsTable(text) {
  const teamOrder = text.match(/\|\s*team_order\s*=\s*([\p{Lu}0-9,\s]+)/u);
  const order = teamOrder
    ? teamOrder[1].split(',').map((c) => c.trim()).filter(Boolean)
    : [...text.matchAll(/\|\s*team(\d+)\s*=\s*([\p{Lu}0-9]{2,4})(?![\p{L}0-9])/gu)].map((m) => m[2]);
  const teams = new Map();
  for (const m of text.matchAll(/\|\s*name_([\p{Lu}0-9]{2,4})\s*=\s*([^\n]*)/gu)) {
    const code = m[1];
    if (teams.has(code)) continue;
    const link = stripLink(m[2]);
    if (!link) continue;
    const num = (k) => {
      const r = text.match(new RegExp(`\\|\\s*${k}_${code}\\s*=\\s*(\\d+)`, 'u'));
      return r ? Number(r[1]) : null;
    };
    teams.set(code, {
      code,
      name: link.label.replace(/[*†‡]+$/, '').trim(),
      wiki: link.target,
      w: num('win'), d: num('draw'), l: num('loss'), gf: num('gf'), ga: num('ga'),
    });
  }
  const codes = order.length ? [...new Set(order)].filter((c) => teams.has(c)) : [...teams.keys()];
  return codes.map((c, i) => ({ ...teams.get(c), pos: order.length ? i + 1 : null }));
}

const cleanName = (raw) => {
  let s = raw.replace(/\{\{sortname\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2');
  const link = stripLink(s);
  if (link) s = link.label;
  return s.replace(/<[^>]+>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').trim();
};

/** Primer bloque de plantilla del primer equipo ({{Fs start}} … {{Fs end}}). */
function parseSquad(text) {
  const start = text.search(/\{\{\s*(Fs start|Football squad start)/i);
  if (start < 0) return [];
  const rest = text.slice(start);
  const endRel = rest.search(/\{\{\s*(Fs end|Football squad end)/i);
  const block = endRel > 0 ? rest.slice(0, endRel) : rest.slice(0, 20000);
  const players = [];
  for (const m of block.matchAll(/\{\{\s*(?:Fs player|Football squad player)\s*\|([^\n]*)\}\}/gi)) {
    const fields = {};
    // Separar por | sin romper los enlaces [[a|b]]
    let depth = 0, cur = '', parts = [];
    for (const ch of m[1]) {
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === '|' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq > 0) fields[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
    }
    if (!fields.name) continue;
    const linked = stripLink(fields.name);
    players.push({
      number: fields.no && /^\d+$/.test(fields.no) ? Number(fields.no) : null,
      pos: (fields.pos || '').toUpperCase(),
      nat: fields.nat || '',
      name: cleanName(fields.name),
      wiki: linked?.target ?? null,
    });
  }
  return players;
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function fetchLeague(league) {
  console.log(`\n== ${league.name}`);
  const current = parseSportsTable(await sportsTableText(SEASON, league.wiki));
  const prev = parseSportsTable(await sportsTableText(PREV_SEASON, league.wiki));
  const prevResolved = await resolveTitles(prev.map((t) => t.wiki));
  const prevByWiki = new Map(prev.map((t) => [prevResolved.get(t.wiki) ?? t.wiki, t]));
  const prevByName = new Map(prev.map((t) => [t.name, t]));

  const clubs = await wikitextMany(current.map((t) => t.wiki));
  for (const c of clubs.values()) c.logo = infoboxImage(c.text) ?? c.pageImage;
  const thumbs = await thumbUrls([...new Set([...clubs.values()].map((c) => c.logo).filter(Boolean))]);

  const teams = [];
  for (const t of current) {
    const club = clubs.get(t.wiki);
    const squad = club ? parseSquad(club.text) : [];
    const last = prevByWiki.get(t.wiki) ?? prevByWiki.get(club?.title) ?? prevByName.get(t.name) ?? null;

    const crestFile = `${league.id}-${asciiCode(t.code)}.png`;
    const crestPath = path.join(ROOT, 'public', 'crests', crestFile);
    let crest = null;
    if (await exists(crestPath)) crest = crestFile;
    else {
      const url = club?.logo ? thumbs.get(club.logo.replace(/_/g, ' ')) ?? thumbs.get(club.logo) : null;
      if (url) {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (res.ok) {
          await writeFile(crestPath, Buffer.from(await res.arrayBuffer()));
          crest = crestFile;
        }
        await sleep(300);
      }
    }
    console.log(`${t.code.padEnd(4)} ${t.name.padEnd(26)} jugadores=${String(squad.length).padStart(2)} escudo=${crest ? 'sí' : 'NO'} temp.anterior=${last ? `${last.pos}º ${last.gf}-${last.ga}` : 'ascendido'}`);
    teams.push({
      code: t.code,
      name: t.name,
      wiki: club?.title ?? t.wiki,
      crest,
      previousSeason: last ? { pos: last.pos, played: (last.w ?? 0) + (last.d ?? 0) + (last.l ?? 0), w: last.w, d: last.d, l: last.l, gf: last.gf, ga: last.ga } : null,
      squad,
    });
  }
  const out = { ...league, season: SEASON, fetchedAt: new Date().toISOString(), teams };
  await writeFile(path.join(ROOT, 'data', 'raw', `${league.id}.json`), JSON.stringify(out, null, 2));
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fetch-data.mjs')) {
  await mkdir(path.join(ROOT, 'data', 'raw'), { recursive: true });
  await mkdir(path.join(ROOT, 'public', 'crests'), { recursive: true });
  const only = process.argv.slice(2);
  for (const league of LEAGUES.filter((l) => !only.length || only.includes(l.id))) await fetchLeague(league);
}
