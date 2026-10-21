import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { monthOf, weekOf } from '../../game/calendar';
import { canCloseSeason, closeSeason } from '../../game/endSeason';
import { currentOvr } from '../../game/level';
import { computeStandings } from '../../game/standings';
import { avgRating } from '../../game/stats';
import type { Competition, CompType, LeagueId, Match, PlayerCompStats } from '../../game/types';
import { playNextDate, playSeason } from '../actions';
import { AppBar, Crest, Rating, Tabs, useTab, useUi, useUrlParam } from '../common';
import { Icon } from '../Icon';
import { COMP_COLORS, FLAGS } from '../labels';
import { useWorld } from '../world';

type HomeTab = 'comps' | 'teams' | 'players' | 'history';

export function Home() {
  const { season } = useWorld();
  const nav = useNavigate();
  const [tab, setTab] = useTab<HomeTab>('comps');
  return (
    <div className="screen">
      <AppBar
        title={tab === 'comps' ? 'Competiciones' : tab === 'teams' ? 'Equipos' : tab === 'players' ? 'Jugadores' : 'Historial'}
        subtitle={`Temporada ${season.label}`}
        left={
          <button className="icon-btn" onClick={() => nav('/settings')} aria-label="Ajustes">
            <Icon name="settings" />
          </button>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'comps', label: 'Torneos', icon: 'trophy' },
            { id: 'teams', label: 'Equipos', icon: 'teams' },
            { id: 'players', label: 'Jugadores', icon: 'person' },
            { id: 'history', label: 'Historial', icon: 'history' },
          ]}
        />
      </AppBar>
      {tab === 'comps' && <CompetitionsTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'players' && <PlayersTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CompetitionsTab() {
  const { season, teams, leagues } = useWorld();
  const ui = useUi();
  const nav = useNavigate();
  const comps = useLiveQuery(() => db.competitions.where('seasonId').equals(season.id).toArray(), [season.id]);
  // Todos los partidos (ligeros) y estadísticas de la temporada: para la próxima fecha y los resúmenes de cada bloque
  const seasonMatches = useLiveQuery(() => db.matches.where('seasonId').equals(season.id).toArray(), [season.id]);
  const seasonStats = useLiveQuery(() => db.stats.where('seasonId').equals(season.id).toArray(), [season.id]);
  const closable = useLiveQuery(() => canCloseSeason(season.id), [season.id, comps]);
  if (!comps || !seasonMatches || !seasonStats) return <div className="empty">Cargando la temporada…</div>;
  const pending = seasonMatches.filter((m) => m.status === 'scheduled');
  const matchesByComp = new Map<string, Match[]>();
  for (const m of seasonMatches) matchesByComp.set(m.compId, [...(matchesByComp.get(m.compId) ?? []), m]);
  const statsByComp = new Map<string, PlayerCompStats[]>();
  for (const st of seasonStats) statsByComp.set(st.compId, [...(statsByComp.get(st.compId) ?? []), st]);

  const nextSlot = pending.length ? Math.min(...pending.map((m) => m.slot)) : null;
  // La semana 0 existe (pretemporada: supercopas), así que se compara con null y no con «falso»
  const nextWeek = nextSlot !== null ? weekOf(nextSlot) : null;
  const weekMatches = nextWeek !== null ? pending.filter((m) => weekOf(m.slot) === nextWeek) : [];
  const weekPlan = describeWeek(weekMatches, comps);
  const pendingByComp = new Map<string, number[]>();
  for (const m of pending) pendingByComp.set(m.compId, [...(pendingByComp.get(m.compId) ?? []), m.round]);

  const status = (c: Competition) => {
    if (c.status === 'finished') return null;
    const rounds = pendingByComp.get(c.id);
    const next = rounds ? Math.min(...rounds) : null;
    const info = c.rounds.find((r) => r.round === next);
    if (c.type === 'league') return `Jornada ${next ?? c.rounds.length} de ${c.rounds.length}`;
    return info?.label ?? 'Esperando ronda';
  };

  const leagueOrder = leagues.map((l) => l.id as string);
  const group = (types: CompType[]) =>
    comps
      .filter((c) => types.includes(c.type))
      .sort((x, y) => types.indexOf(x.type) - types.indexOf(y.type) || leagueOrder.indexOf(x.leagueId ?? '') - leagueOrder.indexOf(y.leagueId ?? ''));

  const close = async () => {
    const next = await ui.run('Cerrando temporada…', () => closeSeason(), { heavy: true });
    if (next) {
      ui.toast('¡Temporada cerrada! Premios entregados y nueva temporada creada');
      nav(`/season/${next - 1}`);
    }
  };

  return (
    <div className="content">
      {closable ? (
        <div className="banner" style={{ marginBottom: 12 }}>
          <Icon name="trophy" size={28} />
          <div className="grow">
            Temporada terminada
            <div className="small" style={{ fontWeight: 500 }}>Entrega los premios y empieza la siguiente</div>
          </div>
          <button className="btn" style={{ background: '#1f1f1f', color: '#fff' }} onClick={close}>
            Cerrar
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 14 }}>
          <div className="small muted">
            Próxima fecha{nextWeek !== null ? ` · ${nextWeek === 0 ? 'pretemporada' : `semana ${nextWeek}`} · ${monthOf(nextWeek)} · ${weekMatches.length} partidos` : ''}
          </div>
          <div style={{ margin: '6px 0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {weekPlan.map((w) => (
              <div key={w.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: COMP_COLORS[w.type], display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Icon name={w.type === 'cup' ? 'medal' : 'trophy'} size={14} color={w.type === 'league' ? '#1f1f1f' : '#fff'} />
                </span>
                <span className="bold">{w.name}</span>
                <span className="muted">· {w.round}</span>
              </div>
            ))}
            {!weekPlan.length && <span className="bold">Sin partidos pendientes</span>}
          </div>
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button
              className="btn"
              disabled={nextSlot === null}
              onClick={async () => {
                const r = await ui.run('Jugando la semana…', (p) => playNextDate(season.id, p), { heavy: true });
                if (r) ui.toast(`Semana jugada: ${r.played} partidos${r.finished.length ? ` · ¡${r.finished.map((c) => c.name).join(', ')} terminada!` : ''}`);
              }}
            >
              <Icon name="forward" size={18} /> Siguiente
            </button>
            <button
              className="btn primary"
              disabled={nextSlot === null}
              onClick={async () => {
                const r = await ui.run('Simulando la temporada…', (p) => playSeason(season.id, p), { heavy: true });
                if (r) ui.toast(`Temporada simulada: ${r.played} partidos`);
              }}
            >
              <Icon name="dice" size={18} /> Temporada
            </button>
          </div>
        </div>
      )}

      {(
        [
          ['Ligas', ['league']],
          ['Europa', ['ucl', 'uel', 'uecl', 'uefasuper']],
          ['Copas y supercopas', ['cup', 'supercup']],
        ] as [string, CompType[]][]
      ).map(([title, types]) => (
        <div key={title}>
          <div className="section-title">{title}</div>
          <div className="grid2">
            {group(types).map((c) => {
              const champ = c.championId ? teams.get(c.championId) : undefined;
              return (
                <Link key={c.id} to={`/c/${c.id}`} className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 108 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: COMP_COLORS[c.type], display: 'grid', placeItems: 'center' }}>
                      <Icon name={c.type === 'cup' ? 'medal' : 'trophy'} size={20} color={c.type === 'league' ? '#1f1f1f' : '#fff'} />
                    </span>
                    {c.leagueId && <span style={{ fontSize: 18 }}>{FLAGS[c.leagueId]}</span>}
                  </div>
                  <div className="bold ellipsis">{c.name}</div>
                  {champ ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="small">
                      <Crest team={champ} size={18} />
                      <span className="ellipsis bold">{champ.short}</span>
                    </div>
                  ) : (
                    <div className="small muted">{status(c)}</div>
                  )}
                  <CompSummary comp={c} matches={matchesByComp.get(c.id) ?? []} stats={statsByComp.get(c.id) ?? []} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Lo más destacado de una competición en este momento: líder y segundo (o favorito), máximo goleador,
 * mejor jugador y el partido más atractivo de la próxima ronda.
 */
function CompSummary({ comp, matches, stats }: { comp: Competition; matches: Match[]; stats: PlayerCompStats[] }) {
  const { teams, players } = useWorld();
  const played = matches.filter((m) => m.status === 'played');
  const lines: { key: string; node: ReactNode }[] = [];
  const team = (id: string) => teams.get(id);
  const teamLine = (key: string, prefix: string, id: string, extra: string) =>
    lines.push({
      key,
      node: (
        <>
          <span className="muted tnum" style={{ width: 12 }}>{prefix}</span>
          <Crest team={team(id)} size={14} />
          <span className="ellipsis grow">{team(id)?.short}</span>
          <b className="tnum">{extra}</b>
        </>
      ),
    });

  // Clasificación (ligas y fase de liga europea mientras dure)
  const phaseOpen = comp.type === 'league' || ((comp.type === 'ucl' || comp.type === 'uel') && matches.some((m) => m.round <= 8 && m.status === 'scheduled'));
  if (phaseOpen && comp.status !== 'finished') {
    if (played.length) {
      const pool = comp.type === 'league' ? matches : matches.filter((m) => m.round <= 8);
      const table = computeStandings(comp.teams, pool);
      teamLine('p1', '1', table[0].teamId, `${table[0].points}`);
      if (comp.type === 'league') teamLine('p2', '2', table[1].teamId, `${table[1].points}`);
    } else {
      const fav = [...comp.teams].sort((a, b) => currentOvr(team(b)!) - currentOvr(team(a)!))[0];
      teamLine('fav', '★', fav, 'favorito');
    }
  }

  // Goleador y mejor jugador
  if (stats.length) {
    const scorer = [...stats].sort((a, b) => b.goals - a.goals || a.apps - b.apps)[0];
    if (scorer.goals > 0)
      lines.push({
        key: 'g',
        node: (
          <>
            <span style={{ width: 12 }}>⚽</span>
            <span className="ellipsis grow">{players.get(scorer.playerId)?.name}</span>
            <b className="tnum">{scorer.goals}</b>
          </>
        ),
      });
    const maxApps = Math.max(...stats.map((x) => x.apps));
    const best = stats.filter((x) => x.rated && x.apps >= Math.max(2, maxApps * 0.5)).sort((a, b) => avgRating(b) - avgRating(a))[0];
    if (best && comp.type === 'league')
      lines.push({
        key: 'r',
        node: (
          <>
            <span style={{ width: 12 }}>⭐</span>
            <span className="ellipsis grow">{players.get(best.playerId)?.name}</span>
            <b className="tnum">{avgRating(best).toFixed(1)}</b>
          </>
        ),
      });
  }

  // Partido estrella de la próxima ronda (no en ligas: ahí hay demasiados)
  if (comp.type !== 'league' && comp.status !== 'finished') {
    const pending = matches.filter((m) => m.status === 'scheduled');
    if (pending.length) {
      const round = Math.min(...pending.map((m) => m.round));
      const top = pending
        .filter((m) => m.round === round)
        .sort((a, b) => currentOvr(team(b.homeId)!) + currentOvr(team(b.awayId)!) - currentOvr(team(a.homeId)!) - currentOvr(team(a.awayId)!))[0];
      lines.push({
        key: 'f',
        node: (
          <>
            <span style={{ width: 12 }}>🔥</span>
            <span className="ellipsis grow">
              {team(top.homeId)?.short} – {team(top.awayId)?.short}
            </span>
          </>
        ),
      });
    }
  }
  if (!lines.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 'auto' }}>
      {lines.map((l) => (
        <div key={l.key} className="small" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {l.node}
        </div>
      ))}
    </div>
  );
}

const TYPE_ORDER: CompType[] = ['uefasuper', 'supercup', 'ucl', 'uel', 'uecl', 'cup', 'league'];
const TYPE_NAMES: Record<CompType, string> = {
  uefasuper: 'Supercopa de Europa',
  supercup: 'Supercopas',
  ucl: 'Champions League',
  uel: 'Europa League',
  uecl: 'Conference League',
  cup: 'Copas',
  league: 'Ligas',
};

/** Qué se juega en la semana: una línea por tipo de competición con su jornada o ronda. */
function describeWeek(matches: Match[], comps: Competition[]) {
  const byType = new Map<CompType, Set<string>>();
  const compsByType = new Map<CompType, Set<string>>();
  for (const m of matches) {
    const c = comps.find((x) => x.id === m.compId);
    if (!c) continue;
    const label = c.rounds.find((r) => r.round === m.round)?.label ?? '';
    byType.set(c.type, (byType.get(c.type) ?? new Set()).add(label));
    compsByType.set(c.type, (compsByType.get(c.type) ?? new Set()).add(c.id));
  }
  return TYPE_ORDER.filter((t) => byType.has(t)).map((type) => {
    const labels = [...byType.get(type)!];
    // Varias ligas pueden ir por jornadas distintas (34 o 38 jornadas)
    const nums = labels.map((l) => Number(l.replace(/\D+/g, ''))).filter((n) => n > 0);
    const round =
      type === 'league' && labels.length > 1 && nums.length === labels.length
        ? `Jornadas ${Math.min(...nums)}–${Math.max(...nums)}`
        : labels.length === 1
          ? labels[0]
          : labels.join(' / ');
    const name = (type === 'cup' || type === 'supercup') && compsByType.get(type)!.size === 1 ? comps.find((c) => compsByType.get(type)!.has(c.id))!.name : TYPE_NAMES[type];
    return { type, name, round };
  });
}

// ---------------------------------------------------------------------------

function TeamsTab() {
  const { leagues, teams } = useWorld();
  const [league, setLeague] = useState<LeagueId>('esp');
  const list = leagues.find((l) => l.id === league)!.teams.map((id) => teams.get(id)!).sort((a, b) => b.ovr - a.ovr || currentOvr(b) - currentOvr(a));
  return (
    <div className="content">
      <div className="chips">
        {leagues.map((l) => (
          <button key={l.id} className={`chip ${league === l.id ? 'active' : ''}`} onClick={() => setLeague(l.id)}>
            {FLAGS[l.id]} {l.name}
          </button>
        ))}
      </div>
      <div className="grid3" style={{ marginTop: 6 }}>
        {list.map((t) => (
          <Link key={t.id} to={`/t/${t.id}`} className="card" style={{ padding: '14px 8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
            <Crest team={t} size={44} />
            <div className="small bold ellipsis" style={{ width: '100%' }}>
              {t.short}
            </div>
            <div className="small muted tnum">
              {t.ovr}
              {currentOvr(t) !== t.ovr && (
                <span style={{ color: currentOvr(t) > t.ovr ? 'var(--win)' : 'var(--loss)' }}> → {currentOvr(t)}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Board = 'goals' | 'assists' | 'ga' | 'rating' | 'cleanSheets' | 'motm';
type Scope = 'all' | CompType;
type Totals = Pick<PlayerCompStats, 'goals' | 'assists' | 'ratingSum' | 'rated' | 'apps' | 'cleanSheets' | 'motm'>;

const BOARDS: [Board, string][] = [
  ['goals', 'Goles'],
  ['assists', 'Asistencias'],
  ['ga', 'G + A'],
  ['rating', 'Nota media'],
  ['motm', 'MVP'],
  ['cleanSheets', 'Porterías a cero'],
];
const SCOPES: [Scope, string][] = [
  ['all', 'Total'],
  ['league', 'Ligas'],
  ['ucl', 'Champions'],
  ['uel', 'Europa League'],
  ['cup', 'Copas'],
];

/** Clasificaciones de jugadores de la temporada: en total o por tipo de competición (y por liga). */
function PlayersTab() {
  const { season, players, teams, leagues } = useWorld();
  const [boardParam, setBoard] = useUrlParam('board');
  const [scopeParam, setScope] = useUrlParam('scope');
  const [leagueParam, setLeague] = useUrlParam('league');
  const board = (boardParam as Board) || 'goals';
  const scope = (scopeParam as Scope) || 'all';
  const league = scope === 'league' ? (leagueParam as LeagueId | 'all') || 'all' : 'all';
  const [query, setQuery] = useState('');
  const stats = useLiveQuery(() => db.stats.where('seasonId').equals(season.id).toArray(), [season.id]);

  const totals = useMemo(() => {
    const map = new Map<string, Totals>();
    for (const s of stats ?? []) {
      // «Supercopas» agrupa las nacionales y la de Europa
      if (scope !== 'all' && s.compType !== scope && !(scope === 'supercup' && s.compType === 'uefasuper')) continue;
      if (league !== 'all' && s.compId !== `${season.id}-league-${league}`) continue;
      const t = map.get(s.playerId) ?? { goals: 0, assists: 0, ratingSum: 0, rated: 0, apps: 0, cleanSheets: 0, motm: 0 };
      t.goals += s.goals;
      t.assists += s.assists;
      t.ratingSum += s.ratingSum;
      t.rated += s.rated;
      t.apps += s.apps;
      t.cleanSheets += s.cleanSheets;
      t.motm += s.motm;
      map.set(s.playerId, t);
    }
    return map;
  }, [stats, scope, league, season.id]);

  if (!stats) return null;
  const q = query.trim().toLowerCase();
  if (q) {
    const found = [...players.values()].filter((p) => p.name.toLowerCase().includes(q)).slice(0, 40);
    return (
      <div className="content">
        <input type="search" placeholder="Buscar jugador" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <div className="card list" style={{ marginTop: 10 }}>
          {found.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`} className="row">
              <Crest team={teams.get(p.teamId)} size={22} />
              <div className="grow ellipsis">{p.name}</div>
              <span className="small muted">{p.role}</span>
            </Link>
          ))}
          {!found.length && <div className="empty">Sin resultados</div>}
        </div>
      </div>
    );
  }

  // Para la nota media hace falta haber jugado una parte razonable de los partidos
  const maxApps = Math.max(1, ...[...totals.values()].map((t) => t.apps));
  const value = (id: string, t: Totals) => {
    switch (board) {
      case 'goals': return t.goals;
      case 'assists': return t.assists;
      case 'ga': return t.goals + t.assists;
      case 'motm': return t.motm;
      case 'cleanSheets': return players.get(id)?.role === 'GK' ? t.cleanSheets : 0;
      case 'rating': return t.apps >= maxApps * 0.4 ? avgRating(t) : 0;
    }
  };
  const ranking = [...totals.entries()]
    .map(([id, t]) => ({ id, t, v: value(id, t) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.t.apps - b.t.apps)
    .slice(0, 30);
  const scopeLabel =
    scope === 'all' ? 'Todas las competiciones' : scope === 'league' && league !== 'all' ? leagues.find((l) => l.id === league)?.name : SCOPES.find(([s]) => s === scope)![1];

  return (
    <div className="content">
      <input type="search" placeholder="Buscar jugador" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips" style={{ marginTop: 10 }}>
        {SCOPES.map(([id, label]) => (
          <button key={id} className={`chip ${scope === id ? 'active' : ''}`} onClick={() => setScope(id)}>
            {label}
          </button>
        ))}
      </div>
      {scope === 'league' && (
        <div className="chips">
          <button className={`chip ${league === 'all' ? 'active' : ''}`} onClick={() => setLeague('all')}>
            Las 6 ligas
          </button>
          {leagues.map((l) => (
            <button key={l.id} className={`chip ${league === l.id ? 'active' : ''}`} onClick={() => setLeague(l.id)}>
              {FLAGS[l.id]} {l.name}
            </button>
          ))}
        </div>
      )}
      <div className="chips">
        {BOARDS.map(([id, label]) => (
          <button key={id} className={`chip ${board === id ? 'active' : ''}`} style={board === id ? { background: '#1f1f1f', color: '#fff' } : undefined} onClick={() => setBoard(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="small muted" style={{ margin: '4px 4px 8px' }}>
        {scopeLabel} · temporada {season.label}
      </div>
      <div className="card list">
        {ranking.map((x, i) => {
          const p = players.get(x.id)!;
          return (
            <Link key={x.id} to={`/p/${x.id}`} className="row">
              <span className="muted tnum" style={{ width: 20 }}>
                {i + 1}
              </span>
              <Crest team={teams.get(p.teamId)} size={22} />
              <div className="grow">
                <div className="ellipsis">{p.name}</div>
                <div className="small muted">
                  {x.t.apps} PJ · {x.t.goals} G · {x.t.assists} A
                </div>
              </div>
              {board === 'rating' ? <Rating value={x.v} /> : <b className="tnum">{x.v}</b>}
            </Link>
          );
        })}
        {!ranking.length && <div className="empty">Aún no hay datos en esta competición</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HistoryTab() {
  const { teams, players } = useWorld();
  const trophies = useLiveQuery(() => db.trophies.toArray());
  const seasons = useLiveQuery(() => db.seasons.toArray());
  const awards = useLiveQuery(() => db.awards.where('type').anyOf('ballonDor').toArray());
  const comps = useLiveQuery(() => db.competitions.filter((c) => c.status === 'finished' && (c.type === 'ucl' || c.type === 'league')).toArray());
  const [all, setAll] = useState(false);
  if (!trophies || !seasons || !awards || !comps) return null;

  const counts = new Map<string, Record<CompType, number>>();
  for (const t of trophies) {
    const c = counts.get(t.teamId) ?? { league: 0, cup: 0, supercup: 0, ucl: 0, uel: 0, uecl: 0, uefasuper: 0 };
    c[t.compType] = (c[t.compType] ?? 0) + 1;
    counts.set(t.teamId, c);
  }
  const table = [...counts.entries()]
    .map(([id, c]) => ({ id, c, total: Object.values(c).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.c.ucl - a.c.ucl || b.c.league - a.c.league || b.total - a.total);

  const finished = seasons.filter((s) => s.status === 'finished').sort((a, b) => b.id - a.id);

  return (
    <div className="content">
      <div className="section-title">Palmarés</div>
      <div className="card" style={{ overflowX: 'auto' }}>
        {table.length ? (
          <table className="table compact">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: 12 }}>Club</th>
                <th title="Champions League">UCL</th>
                <th title="Ligas">Liga</th>
                <th title="Copas nacionales">Copa</th>
                <th title="Europa League">UEL</th>
                <th title="Conference League">UECL</th>
                <th title="Supercopas nacionales">Sup.</th>
                <th title="Supercopa de Europa">SCE</th>
                <th title="Total de títulos">Tot.</th>
              </tr>
            </thead>
            <tbody>
              {(all ? table : table.slice(0, 15)).map((r) => {
                const t = teams.get(r.id)!;
                return (
                  <tr key={r.id}>
                    <td className="team" style={{ paddingLeft: 12 }}>
                      <Link to={`/t/${r.id}?tab=trophies`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Crest team={t} size={20} />
                        <span className="ellipsis" style={{ maxWidth: 92 }}>{t.short}</span>
                      </Link>
                    </td>
                    <td className="tnum bold">{r.c.ucl || '·'}</td>
                    <td className="tnum">{r.c.league || '·'}</td>
                    <td className="tnum">{r.c.cup || '·'}</td>
                    <td className="tnum">{r.c.uel || '·'}</td>
                    <td className="tnum">{r.c.uecl || '·'}</td>
                    <td className="tnum">{r.c.supercup || '·'}</td>
                    <td className="tnum">{r.c.uefasuper || '·'}</td>
                    <td className="tnum bold">{r.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">Todos los clubes empiezan con 0 títulos. El palmarés se irá llenando con tus temporadas.</div>
        )}
      </div>
      {table.length > 15 && (
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>
          {all ? 'Ver menos' : `Ver los ${table.length} clubes`}
        </button>
      )}

      <div className="section-title">Temporadas</div>
      <div className="card list">
        {finished.map((s) => {
          const bd = awards.find((a) => a.seasonId === s.id);
          const ucl = comps.find((c) => c.seasonId === s.id && c.type === 'ucl');
          return (
            <Link key={s.id} to={`/season/${s.id}`} className="row">
              <div className="grow">
                <div className="bold">{s.label}</div>
                <div className="small muted ellipsis">
                  {ucl?.championId && `Champions: ${teams.get(ucl.championId)?.short}`}
                  {bd && ` · Balón de Oro: ${players.get(bd.playerId)?.name}`}
                </div>
              </div>
              <Icon name="chevronRight" color="var(--muted)" />
            </Link>
          );
        })}
        {!finished.length && <div className="empty">Aquí aparecerá cada temporada que cierres, con sus campeones y premios.</div>}
      </div>
      <Link to="/records" className="btn block" style={{ marginTop: 12 }}>
        <Icon name="star" size={18} /> Récords históricos
      </Link>
    </div>
  );
}
