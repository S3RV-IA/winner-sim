import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { monthOf, weekOf } from '../../game/calendar';
import { computeStandings } from '../../game/standings';
import { avgRating } from '../../game/stats';
import type { Competition as Comp, Match, PlayerCompStats, StandingRow } from '../../game/types';
import { describe, playCompetition, playOne, playRound } from '../actions';
import { AppBar, Crest, FormDots, MatchCard, Rating, Sheet, Tabs, useTab, useUi, useUrlParam, type TabDef } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';

type CompTab = 'matches' | 'table' | 'bracket' | 'stats';

export function Competition() {
  const { id } = useParams();
  const comp = useLiveQuery(() => db.competitions.get(id!), [id]);
  const { season } = useWorld();
  const defaultTab: CompTab = 'matches';
  const [tab, setTab] = useTab<CompTab>(defaultTab);
  if (!comp) return null;

  const tabs: TabDef<CompTab>[] = [{ id: 'matches', label: 'Partidos', icon: 'list' }];
  if (comp.type === 'league' || comp.type === 'ucl' || comp.type === 'uel') tabs.push({ id: 'table', label: comp.type === 'league' ? 'Clasificación' : 'Fase de liga', icon: 'table' });
  if (comp.type !== 'league') tabs.push({ id: 'bracket', label: 'Cuadro', icon: 'bracket' });
  tabs.push({ id: 'stats', label: 'Estadísticas', icon: 'chart' });

  const seasonLabel = comp.seasonId === season.id ? season.label : '';
  return (
    <div className="screen">
      <AppBar title={comp.name} subtitle={comp.status === 'finished' ? `${seasonLabel} · Terminada` : seasonLabel} back>
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </AppBar>
      {tab === 'matches' && <MatchesTab comp={comp} />}
      {tab === 'table' && <TableTab comp={comp} />}
      {tab === 'bracket' && <BracketTab comp={comp} />}
      {tab === 'stats' && <StatsTab comp={comp} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MatchesTab({ comp }: { comp: Comp }) {
  const ui = useUi();
  const all = useLiveQuery(() => db.matches.where('compId').equals(comp.id).toArray(), [comp.id]);
  const [roundParam, setRoundParam] = useUrlParam('round');
  const round = roundParam ? Number(roundParam) : null;
  const setRound = (r: number) => setRoundParam(String(r));
  const [sheet, setSheet] = useState(false);

  const existing = useMemo(() => [...new Set((all ?? []).map((m) => m.round))].sort((a, b) => a - b), [all]);
  // Ronda por defecto: la primera con partidos pendientes, o la última jugada
  useEffect(() => {
    if (!all || round !== null) return;
    const pending = all.filter((m) => m.status === 'scheduled').map((m) => m.round);
    setRound(pending.length ? Math.min(...pending) : existing[existing.length - 1] ?? 1);
  }, [all, round, existing]);
  if (!all || round === null) return null;

  const info = comp.rounds.find((r) => r.round === round)!;
  const matches = all.filter((m) => m.round === round).sort((a, b) => (a.bracket ?? 0) - (b.bracket ?? 0) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const idx = comp.rounds.findIndex((r) => r.round === round);
  const go = (d: number) => {
    const n = comp.rounds[idx + d];
    if (n) setRound(n.round);
  };
  const pendingHere = matches.some((m) => m.status === 'scheduled');
  const pendingAny = all.some((m) => m.status === 'scheduled') || comp.status !== 'finished';

  const simulateRound = async () => {
    setSheet(false);
    const r = await ui.run(`Simulando ${info.label.toLowerCase()}…`, (p) => playRound(comp, round, p), { heavy: true });
    if (r) ui.toast(describe(r, info.label));
  };
  const simulateAll = async () => {
    setSheet(false);
    const r = await ui.run(`Simulando ${comp.name}…`, (p) => playCompetition(comp, p), { heavy: true });
    if (r) ui.toast(describe(r, comp.name));
  };

  return (
    <div className="content">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <button className="icon-btn" onClick={() => go(-1)} disabled={idx <= 0} aria-label="Ronda anterior">
          <Icon name="chevronLeft" />
        </button>
        <select
          value={round}
          onChange={(e) => setRound(Number(e.target.value))}
          className="grow bold"
          style={{ height: 40, textAlign: 'center', border: 0, background: 'var(--surface)', borderRadius: 10, boxShadow: 'var(--shadow)', fontSize: 15 }}
        >
          {comp.rounds.map((r) => (
            <option key={r.round} value={r.round}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={() => go(1)} disabled={idx >= comp.rounds.length - 1} aria-label="Ronda siguiente">
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="small muted" style={{ textAlign: 'center', marginBottom: 10 }}>
        {weekOf(info.slot) === 0 ? 'Pretemporada' : `Semana ${weekOf(info.slot)}`} · {monthOf(weekOf(info.slot))}
      </div>

      {matches.length ? (
        <div className="card list">
          {matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              firstLeg={m.firstLegId ? all.find((x) => x.id === m.firstLegId) : undefined}
              onSimulate={async () => {
                await ui.run('Simulando partido…', () => playOne(m.id));
              }}
            />
          ))}
        </div>
      ) : (
        <div className="card empty">Los cruces de esta ronda se decidirán cuando termine la anterior.</div>
      )}

      {pendingAny && (
        <button className="fab" onClick={() => setSheet(true)}>
          <Icon name="dice" /> Simular
        </button>
      )}
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Simular">
        <button className="option" onClick={simulateRound} disabled={!pendingHere && !matches.length}>
          <Icon name="forward" color="var(--accent-strong)" />
          <div>
            {info.label}
            <small>Juega antes lo pendiente del calendario para respetar el orden</small>
          </div>
        </button>
        <button className="option" onClick={simulateAll}>
          <Icon name="dice" color="var(--accent-strong)" />
          <div>
            Hasta el final de {comp.name}
            <small>Avanza el calendario de todas las competiciones hasta esa fecha</small>
          </div>
        </button>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------

function useStandings(comp: Comp) {
  const matches = useLiveQuery(() => db.matches.where('compId').equals(comp.id).toArray(), [comp.id]);
  return useMemo(() => {
    if (!matches) return null;
    const pool = comp.type === 'league' ? matches : matches.filter((m) => m.round <= 8);
    return computeStandings(comp.teams, pool);
  }, [matches, comp]);
}

function TableTab({ comp }: { comp: Comp }) {
  const { teams, config } = useWorld();
  const table = useStandings(comp);
  if (!table) return null;
  const zones =
    comp.type === 'league'
      ? config.zones[comp.leagueId!]
      : { ucl: 8, uel: 24, rel: 0 }; // fase de liga europea: 1-8 octavos, 9-24 playoff
  const zoneColor = (pos: number) => {
    if (comp.type !== 'league') return pos <= 8 ? 'var(--win)' : pos <= 24 ? 'var(--uel)' : undefined;
    if (pos <= zones.ucl) return 'var(--ucl)';
    if (pos <= zones.ucl + zones.uel) return 'var(--uel)';
    if (pos <= zones.ucl + zones.uel + (zones.uecl ?? 1)) return 'var(--uecl)';
    if (pos > table.length - zones.rel) return 'var(--rel)';
    return undefined;
  };
  return (
    <div className="content" style={{ paddingLeft: 8, paddingRight: 8 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <Standings rows={table} zoneColor={zoneColor} teams={teams} />
        <div className="legend">
          {comp.type === 'league' ? (
            <>
              <span><i style={{ background: 'var(--ucl)' }} />Champions</span>
              <span><i style={{ background: 'var(--uel)' }} />Europa League</span>
              <span><i style={{ background: 'var(--uecl)' }} />Conference</span>
              <span><i style={{ background: 'var(--rel)' }} />Descenso (penaliza la forma)</span>
            </>
          ) : (
            <>
              <span><i style={{ background: 'var(--win)' }} />Octavos</span>
              <span><i style={{ background: 'var(--uel)' }} />Playoff</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Standings({ rows, zoneColor, teams }: { rows: StandingRow[]; zoneColor: (pos: number) => string | undefined; teams: Map<string, import('../../game/types').Team> }) {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 400;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th style={{ textAlign: 'left' }}>Equipo</th>
          <th>PJ</th>
          {!narrow && <th>G</th>}
          {!narrow && <th>E</th>}
          {!narrow && <th>P</th>}
          <th>GF</th>
          <th>GC</th>
          <th>DG</th>
          <th>Pts</th>
          {!narrow && <th>Forma</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const t = teams.get(r.teamId)!;
          const color = zoneColor(i + 1);
          return (
            <tr key={r.teamId}>
              <td className="pos tnum">
                {color && <span className="zone-bar" style={{ background: color }} />}
                {i + 1}
              </td>
              <td className="team">
                <Link to={`/t/${t.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Crest team={t} size={20} />
                  <span className="ellipsis" style={{ maxWidth: narrow ? 96 : 170 }}>
                    {t.short}
                  </span>
                </Link>
              </td>
              <td className="tnum">{r.played}</td>
              {!narrow && <td className="tnum">{r.won}</td>}
              {!narrow && <td className="tnum">{r.drawn}</td>}
              {!narrow && <td className="tnum">{r.lost}</td>}
              <td className="tnum">{r.gf}</td>
              <td className="tnum">{r.ga}</td>
              <td className="tnum">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
              <td className="tnum bold">{r.points}</td>
              {!narrow && (
                <td>
                  <FormDots last={r.last} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------

function BracketTab({ comp }: { comp: Comp }) {
  const { teams } = useWorld();
  const matches = useLiveQuery(() => db.matches.where('compId').equals(comp.id).toArray(), [comp.id]);
  if (!matches) return null;
  const koRounds = comp.rounds.filter((r) => r.kind !== 'league' && r.kind !== 'leg2');
  const champion = comp.championId ? teams.get(comp.championId) : undefined;

  return (
    <div className="content">
      {champion && (
        <div className="card" style={{ padding: 16, textAlign: 'center', marginBottom: 12 }}>
          <div className="small muted bold">CAMPEÓN</div>
          <div style={{ margin: '10px 0 6px', display: 'flex', justifyContent: 'center' }}>
            <Crest team={champion} size={56} />
          </div>
          <div className="bold">{champion.name}</div>
        </div>
      )}
      {koRounds.map((r) => {
        const legs = matches.filter((m) => m.round === r.round);
        const label = r.label.replace(' (ida)', '');
        return (
          <div key={r.round}>
            <div className="section-title">{label}</div>
            {legs.length ? (
              <div className="card list">
                {legs
                  .sort((a, b) => (a.bracket ?? 0) - (b.bracket ?? 0))
                  .map((m) => (
                    <Tie key={m.id} first={m} second={matches.find((x) => x.firstLegId === m.id)} />
                  ))}
              </div>
            ) : (
              <div className="card empty small">Por decidir</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Una eliminatoria: partido único o ida y vuelta con el global. */
function Tie({ first, second }: { first: Match; second?: Match }) {
  const { teams } = useWorld();
  // Equipos en el orden de la ida
  const a = first.homeId;
  const b = first.awayId;
  const goals = (team: string) => {
    let g = 0;
    for (const m of [first, second]) if (m?.score) g += m.homeId === team ? m.score[0] : m.score[1];
    return g;
  };
  const decisive = second ?? first;
  const done = decisive.status === 'played';
  const winner = done ? (decisive.winner === 0 ? decisive.homeId : decisive.winner === 1 ? decisive.awayId : null) : null;
  return (
    <Link to={`/m/${decisive.id}`} className="row" style={{ alignItems: 'stretch' }}>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[a, b].map((t) => (
          <div key={t} className={`match-team ${winner && winner !== t ? 'loser' : ''}`}>
            <Crest team={teams.get(t)} size={22} />
            <span className="name ellipsis">{teams.get(t)?.short}</span>
            {second && first.score && <span className="small muted tnum">{first.homeId === t ? first.score[0] : first.score[1]}</span>}
            {second?.score && <span className="small muted tnum" style={{ marginLeft: 8 }}>{second.homeId === t ? second.score[0] : second.score[1]}</span>}
            {decisive.penalties && <span className="pens tnum">({decisive.homeId === t ? decisive.penalties[0] : decisive.penalties[1]})</span>}
            <span className="score tnum" style={{ marginLeft: 10 }}>{first.score ? goals(t) : ''}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------

type StatKey = 'goals' | 'assists' | 'rating' | 'cleanSheets' | 'shotsOn' | 'dribbles' | 'keyPasses' | 'motm' | 'yellow';
const STAT_LABELS: [StatKey, string][] = [
  ['goals', 'Goles'],
  ['assists', 'Asistencias'],
  ['rating', 'Nota media'],
  ['motm', 'MVP del partido'],
  ['cleanSheets', 'Porterías a cero'],
  ['shotsOn', 'Tiros a puerta'],
  ['dribbles', 'Regates'],
  ['keyPasses', 'Pases clave'],
  ['yellow', 'Amarillas'],
];

function StatsTab({ comp }: { comp: Comp }) {
  const { players, teams } = useWorld();
  const [key, setKey] = useState<StatKey>('goals');
  const stats = useLiveQuery(() => db.stats.where('compId').equals(comp.id).toArray(), [comp.id]);
  if (!stats) return null;
  const maxApps = Math.max(1, ...stats.map((s) => s.apps));
  const value = (s: PlayerCompStats) => {
    if (key === 'rating') return s.apps >= maxApps * 0.4 ? avgRating(s) : 0;
    if (key === 'cleanSheets') return players.get(s.playerId)?.role === 'GK' ? s.cleanSheets : 0;
    return s[key];
  };
  const list = stats
    .map((s) => ({ s, v: value(s) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.s.minutes - b.s.minutes)
    .slice(0, 25);
  return (
    <div className="content">
      <div className="chips">
        {STAT_LABELS.map(([k, l]) => (
          <button key={k} className={`chip ${key === k ? 'active' : ''}`} onClick={() => setKey(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="card list" style={{ marginTop: 8 }}>
        {list.map((x, i) => {
          const p = players.get(x.s.playerId);
          if (!p) return null;
          return (
            <Link key={x.s.key} to={`/p/${p.id}`} className="row">
              <span className="muted tnum" style={{ width: 20 }}>
                {i + 1}
              </span>
              <Crest team={teams.get(x.s.teamId)} size={22} />
              <div className="grow">
                <div className="ellipsis">{p.name}</div>
                <div className="small muted">
                  {x.s.apps} PJ · {x.s.goals} G · {x.s.assists} A
                </div>
              </div>
              {key === 'rating' ? <Rating value={x.v} /> : <b className="tnum">{x.v}</b>}
            </Link>
          );
        })}
        {!list.length && <div className="empty">Sin datos todavía</div>}
      </div>
    </div>
  );
}
