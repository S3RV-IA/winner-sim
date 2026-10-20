import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { monthOf, weekOf } from '../../game/calendar';
import { canCloseSeason, closeSeason } from '../../game/endSeason';
import { avgRating } from '../../game/stats';
import type { Competition, CompType, LeagueId, PlayerCompStats } from '../../game/types';
import { describe, playNextDate, playSeason } from '../actions';
import { AppBar, Crest, Rating, Tabs, useTab, useUi } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';

type HomeTab = 'comps' | 'teams' | 'players' | 'history';

export const COMP_COLORS: Record<CompType, string> = { league: '#ffb300', cup: '#10b981', ucl: '#1d4ed8', uel: '#f97316' };
export const FLAGS: Record<LeagueId, string> = { eng: '🏴', esp: '🇪🇸', ger: '🇩🇪', ita: '🇮🇹', fra: '🇫🇷', por: '🇵🇹' };

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
  const pending = useLiveQuery(
    () => db.matches.where('status').equals('scheduled').filter((m) => m.seasonId === season.id).toArray(),
    [season.id],
  );
  const closable = useLiveQuery(() => canCloseSeason(season.id), [season.id, comps]);
  if (!comps || !pending) return null;

  const nextSlot = pending.length ? Math.min(...pending.map((m) => m.slot)) : null;
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
          <div className="small muted">Próxima fecha</div>
          <div className="bold" style={{ margin: '2px 0 12px' }}>
            {nextSlot ? `Semana ${weekOf(nextSlot)} · ${monthOf(weekOf(nextSlot))} · ${pending.filter((m) => m.slot === nextSlot).length} partidos` : 'Sin partidos pendientes'}
          </div>
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button
              className="btn"
              disabled={!nextSlot}
              onClick={async () => {
                const r = await ui.run('Jugando la fecha…', (p) => playNextDate(season.id, p), { heavy: true });
                if (r) ui.toast(describe(r, 'Fecha jugada'));
              }}
            >
              <Icon name="forward" size={18} /> Siguiente
            </button>
            <button
              className="btn primary"
              disabled={!nextSlot}
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
          ['Europa', ['ucl', 'uel']],
          ['Copas nacionales', ['cup']],
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
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TeamsTab() {
  const { leagues, teams } = useWorld();
  const [league, setLeague] = useState<LeagueId>('esp');
  const list = leagues.find((l) => l.id === league)!.teams.map((id) => teams.get(id)!).sort((a, b) => b.ovr - a.ovr);
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
            <div className="small muted tnum">{t.ovr}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Board = 'goals' | 'assists' | 'rating' | 'ga';

function PlayersTab() {
  const { season, players, teams } = useWorld();
  const [board, setBoard] = useState<Board>('goals');
  const [query, setQuery] = useState('');
  const stats = useLiveQuery(() => db.stats.where('seasonId').equals(season.id).toArray(), [season.id]);

  const totals = useMemo(() => {
    const map = new Map<string, Pick<PlayerCompStats, 'goals' | 'assists' | 'ratingSum' | 'rated' | 'apps'>>();
    for (const s of stats ?? []) {
      const t = map.get(s.playerId) ?? { goals: 0, assists: 0, ratingSum: 0, rated: 0, apps: 0 };
      t.goals += s.goals;
      t.assists += s.assists;
      t.ratingSum += s.ratingSum;
      t.rated += s.rated;
      t.apps += s.apps;
      map.set(s.playerId, t);
    }
    return map;
  }, [stats]);

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

  const maxApps = Math.max(1, ...[...totals.values()].map((t) => t.apps));
  const value = (t: Pick<PlayerCompStats, 'goals' | 'assists' | 'ratingSum' | 'rated' | 'apps'>) =>
    board === 'goals' ? t.goals : board === 'assists' ? t.assists : board === 'ga' ? t.goals + t.assists : t.apps >= maxApps * 0.4 ? avgRating(t) : 0;
  const ranking = [...totals.entries()]
    .map(([id, t]) => ({ id, t, v: value(t) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 30);

  return (
    <div className="content">
      <input type="search" placeholder="Buscar jugador" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips" style={{ marginTop: 10 }}>
        {(
          [
            ['goals', 'Goles'],
            ['assists', 'Asistencias'],
            ['ga', 'G + A'],
            ['rating', 'Nota media'],
          ] as [Board, string][]
        ).map(([id, label]) => (
          <button key={id} className={`chip ${board === id ? 'active' : ''}`} onClick={() => setBoard(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="small muted" style={{ margin: '4px 4px 8px' }}>
        Todas las competiciones · temporada {season.label}
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
                <div className="small muted">{x.t.apps} partidos</div>
              </div>
              {board === 'rating' ? <Rating value={x.v} /> : <b className="tnum">{x.v}</b>}
            </Link>
          );
        })}
        {!ranking.length && <div className="empty">Aún no se ha jugado ningún partido</div>}
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
    const c = counts.get(t.teamId) ?? { league: 0, cup: 0, ucl: 0, uel: 0 };
    c[t.compType]++;
    counts.set(t.teamId, c);
  }
  const table = [...counts.entries()]
    .map(([id, c]) => ({ id, c, total: c.league + c.cup + c.ucl + c.uel }))
    .sort((a, b) => b.c.ucl - a.c.ucl || b.c.league - a.c.league || b.total - a.total);

  const finished = seasons.filter((s) => s.status === 'finished').sort((a, b) => b.id - a.id);

  return (
    <div className="content">
      <div className="section-title">Palmarés</div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {table.length ? (
          <table className="table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: 12 }}>Club</th>
                <th title="Champions">UCL</th>
                <th title="Ligas">Liga</th>
                <th title="Copas">Copa</th>
                <th title="Europa League">UEL</th>
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
                        <span className="ellipsis">{t.short}</span>
                      </Link>
                    </td>
                    <td className="tnum bold">{r.c.ucl || '·'}</td>
                    <td className="tnum">{r.c.league || '·'}</td>
                    <td className="tnum">{r.c.cup || '·'}</td>
                    <td className="tnum">{r.c.uel || '·'}</td>
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
