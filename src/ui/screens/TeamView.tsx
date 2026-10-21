import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { computeStandings } from '../../game/standings';
import { avgRating } from '../../game/stats';
import type { CompType, Team } from '../../game/types';
import { AppBar, Crest, FormArrow, FormDots, MatchCard, Rating, Sheet, Stepper, Tabs, useTab, useUi } from '../common';
import { Icon } from '../Icon';
import { COMP_TROPHY_LABEL } from '../labels';
import { useWorld } from '../world';
import { TRAITS } from '../../game/traits';
import { RIVALS, headToHead } from '../../game/preview';
import { HeadToHeadCard } from '../MatchParts';
import { currentOvr, currentRatings, weightedOvr } from '../../game/level';

type TeamTab = 'squad' | 'matches' | 'rivals' | 'trophies';
const ROLE_ORDER = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];
const ROLE_GROUP: Record<string, string> = { GK: 'Porteros', CB: 'Defensas', LB: 'Defensas', RB: 'Defensas', DM: 'Centrocampistas', CM: 'Centrocampistas', AM: 'Centrocampistas', LW: 'Delanteros', RW: 'Delanteros', ST: 'Delanteros' };

export function Bar({ label, value, color = 'var(--accent)' }: { label: string; value: number; color?: string }) {
  return (
    <div className="attr">
      <span>{label}</span>
      <div className="bar">
        <span style={{ width: `${value}%`, background: color }} />
      </div>
      <b className="tnum" style={{ textAlign: 'right' }}>
        {Math.round(value)}
      </b>
    </div>
  );
}

export function TeamView() {
  const { id } = useParams();
  const { teams, leagues, season, config } = useWorld();
  const team = teams.get(id!);
  const [tab, setTab] = useTab<TeamTab>('squad');
  const [edit, setEdit] = useState(false);
  const leagueComp = `${season.id}-league-${team?.leagueId}`;
  const leagueMatches = useLiveQuery(() => db.matches.where('compId').equals(leagueComp).toArray(), [leagueComp]);
  if (!team) return null;
  const league = leagues.find((l) => l.id === team.leagueId)!;
  const now = currentRatings(team);
  const momentum = team.momentum ?? 0;
  const table = leagueMatches ? computeStandings(league.teams, leagueMatches) : [];
  const pos = table.findIndex((r) => r.teamId === team.id);
  const row = table[pos];

  return (
    <div className="screen">
      <AppBar
        title={team.short}
        subtitle={league.name}
        back
        actions={
          <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Editar niveles">
            <Icon name="edit" />
          </button>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'squad', label: 'Plantilla', icon: 'teams' },
            { id: 'matches', label: 'Partidos', icon: 'calendar' },
            { id: 'rivals', label: 'Rivales', icon: 'swap' },
            { id: 'trophies', label: 'Palmarés', icon: 'trophy' },
          ]}
        />
      </AppBar>
      <div className="content">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Crest team={team} size={64} />
            <div className="grow">
              <div className="bold" style={{ fontSize: 17 }}>
                {team.name}
              </div>
              <div className="small muted">
                {row && row.played ? `${pos + 1}.º · ${row.points} pts en ${row.played} partidos` : `Nivel histórico ${team.ovr}`}
              </div>
              {row && row.last.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <FormDots last={row.last} />
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800 }} className="tnum">
                {currentOvr(team)}
              </div>
              <div className="small muted">nivel actual</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Bar label="Ataque" value={now.att} color="#ef4444" />
            <Bar label="Control" value={now.ctl} color="#3b82f6" />
            <Bar label="Defensa" value={now.def} color="#16a34a" />
          </div>
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 8, textAlign: 'center' }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 4px' }}>
              <div className="bold tnum">{team.ovr}</div>
              <div className="small muted">Nivel histórico</div>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 4px' }}>
              <div className="bold tnum" style={{ color: momentum > 0.4 ? 'var(--win)' : momentum < -0.4 ? 'var(--loss)' : undefined }}>
                {momentum > 0 ? '+' : ''}
                {momentum.toFixed(1)}
              </div>
              <div className="small muted">Momento del club</div>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 4px' }}>
              <div className="bold tnum" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: team.form > 0.15 ? 'var(--win)' : team.form < -0.15 ? 'var(--loss)' : undefined }}>
                {team.form * config.sim.formImpact > 0 ? '+' : ''}
                {(team.form * config.sim.formImpact).toFixed(1)}
              </div>
              <div className="small muted">Racha</div>
            </div>
          </div>
          <div className="small muted" style={{ padding: '8px 4px 0' }}>
            El nivel histórico refleja el peso y la identidad del club. El momento (largo plazo) y la racha (últimos partidos) suben o bajan el nivel con el que
            juega hoy.
          </div>
          {(TRAITS[team.id] ?? []).length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TRAITS[team.id].map((t) => (
                <div key={t.name} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
                  <Icon name="star" size={18} color="var(--accent-strong)" />
                  <div>
                    <div className="bold small">{t.name}</div>
                    <div className="small muted">{t.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === 'squad' && <Squad team={team} />}
        {tab === 'matches' && <TeamMatches team={team} />}
        {tab === 'rivals' && <TeamRivals team={team} />}
        {tab === 'trophies' && <TeamTrophies team={team} />}
      </div>
      <EditTeam team={team} open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}

function Squad({ team }: { team: Team }) {
  const { players, season } = useWorld();
  const stats = useLiveQuery(() => db.stats.where('teamId').equals(team.id).filter((s) => s.seasonId === season.id).toArray(), [team.id, season.id]);
  const squad = [...players.values()].filter((p) => p.teamId === team.id).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.ovr - a.ovr);
  const totals = new Map<string, { apps: number; goals: number; assists: number; ratingSum: number; rated: number }>();
  for (const s of stats ?? []) {
    const t = totals.get(s.playerId) ?? { apps: 0, goals: 0, assists: 0, ratingSum: 0, rated: 0 };
    t.apps += s.apps;
    t.goals += s.goals;
    t.assists += s.assists;
    t.ratingSum += s.ratingSum;
    t.rated += s.rated;
    totals.set(s.playerId, t);
  }
  const groups = ['Porteros', 'Defensas', 'Centrocampistas', 'Delanteros'];
  return (
    <>
      {groups.map((g) => (
        <div key={g}>
          <div className="section-title">{g}</div>
          <div className="card list">
            {squad
              .filter((p) => ROLE_GROUP[p.role] === g)
              .map((p) => {
                const t = totals.get(p.id);
                return (
                  <Link key={p.id} to={`/p/${p.id}`} className="row">
                    <span className="muted tnum small" style={{ width: 22, textAlign: 'right' }}>
                      {p.number ?? ''}
                    </span>
                    <div className="grow">
                      <div className="ellipsis">{p.name}</div>
                      <div className="small muted">
                        {p.role} · {p.ovr}
                        {t ? ` · ${t.apps} PJ · ${t.goals} G · ${t.assists} A` : ''}
                      </div>
                    </div>
                    <FormArrow form={p.form} />
                    {t && t.rated > 0 && <Rating value={avgRating(t)} />}
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </>
  );
}

function TeamMatches({ team }: { team: Team }) {
  const { season } = useWorld();
  const matches = useLiveQuery(
    async () => {
      const [h, a] = await Promise.all([db.matches.where('homeId').equals(team.id).toArray(), db.matches.where('awayId').equals(team.id).toArray()]);
      return [...h, ...a].filter((m) => m.seasonId === season.id).sort((x, y) => x.slot - y.slot);
    },
    [team.id, season.id],
  );
  const comps = useLiveQuery(() => db.competitions.where('seasonId').equals(season.id).toArray(), [season.id]);
  if (!matches || !comps) return null;
  const name = (cid: string) => comps.find((c) => c.id === cid)?.name ?? '';
  return (
    <>
      <div className="section-title">Temporada {season.label}</div>
      <div className="card list">
        {matches.map((m) => {
          const c = comps.find((x) => x.id === m.compId);
          const r = c?.rounds.find((x) => x.round === m.round);
          return (
            <div key={m.id}>
              <div className="small muted" style={{ padding: '8px 12px 0' }}>
                {name(m.compId)} · {r?.label}
              </div>
              <MatchCard match={m} firstLeg={m.firstLegId ? matches.find((x) => x.id === m.firstLegId) : undefined} />
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Competiciones que se deciden en una final (las ligas no). */
const FINAL_TYPES: CompType[] = ['ucl', 'uel', 'uecl', 'cup', 'supercup', 'uefasuper'];

function TeamTrophies({ team }: { team: Team }) {
  const trophies = useLiveQuery(() => db.trophies.where('teamId').equals(team.id).toArray(), [team.id]);
  const seasons = useLiveQuery(() => db.seasons.toArray());
  const finals = useLiveQuery(
    () => db.competitions.filter((c) => c.status === 'finished' && FINAL_TYPES.includes(c.type) && (c.championId === team.id || c.runnerUpId === team.id)).toArray(),
    [team.id],
  );
  if (!trophies || !seasons || !finals) return null;
  // Finales por competición: jugadas, ganadas y perdidas
  const byComp = new Map<string, { type: CompType; played: number; won: number }>();
  for (const c of finals) {
    const name = c.name;
    const row = byComp.get(name) ?? { type: c.type, played: 0, won: 0 };
    row.played++;
    if (c.championId === team.id) row.won++;
    byComp.set(name, row);
  }
  const label = (sid: number) => seasons.find((s) => s.id === sid)?.label ?? '';
  const types: CompType[] = ['ucl', 'league', 'cup', 'uel', 'uecl', 'supercup', 'uefasuper'];
  return (
    <>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12, gap: 8 }}>
        {types.map((t) => (
          <div key={t} className="card" style={{ padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800 }} className="tnum">
              {trophies.filter((x) => x.compType === t).length}
            </div>
            <div className="small muted">{COMP_TROPHY_LABEL[t]}</div>
          </div>
        ))}
      </div>
      <div className="section-title">Finales disputadas</div>
      <div className="card list">
        {[...byComp.entries()]
          .sort((a, b) => FINAL_TYPES.indexOf(a[1].type) - FINAL_TYPES.indexOf(b[1].type))
          .map(([name, r]) => (
            <div key={name} className="row">
              <Icon name="medal" color="var(--accent)" />
              <div className="grow">{name}</div>
              <span className="small">
                <b className="tnum">{r.played}</b> {r.played === 1 ? 'final' : 'finales'} ·{' '}
                <span style={{ color: 'var(--win)' }}>{r.won} {r.won === 1 ? 'ganada' : 'ganadas'}</span> ·{' '}
                <span style={{ color: 'var(--loss)' }}>{r.played - r.won} {r.played - r.won === 1 ? 'perdida' : 'perdidas'}</span>
              </span>
            </div>
          ))}
        {!byComp.size && <div className="empty">Todavía no ha jugado ninguna final</div>}
      </div>
      <div className="section-title">Títulos</div>
      <div className="card list">
        {trophies
          .sort((a, b) => b.seasonId - a.seasonId)
          .map((t) => (
            <div key={t.id} className="row">
              <Icon name="trophy" color="var(--accent)" />
              <div className="grow">{t.compName}</div>
              <span className="muted small">{label(t.seasonId)}</span>
            </div>
          ))}
        {!trophies.length && <div className="empty">Todavía sin títulos en esta partida</div>}
      </div>
    </>
  );
}

function EditTeam({ team, open, onClose }: { team: Team; open: boolean; onClose: () => void }) {
  const ui = useUi();
  const [v, setV] = useState({ att: team.att, ctl: team.ctl, def: team.def, momentum: Math.round(team.momentum ?? 0) });
  const ovr = Math.round(weightedOvr(v));
  return (
    <Sheet open={open} onClose={onClose} title={`Niveles de ${team.short}`}>
      {(
        [
          ['att', 'Ataque'],
          ['ctl', 'Control'],
          ['def', 'Defensa'],
        ] as const
      ).map(([k, label]) => (
        <div key={k} className="row" style={{ padding: '6px 4px' }}>
          <div className="grow">{label}</div>
          <Stepper value={v[k]} min={1} max={100} onChange={(n) => setV({ ...v, [k]: n })} />
        </div>
      ))}
      <div className="row" style={{ padding: '6px 4px' }}>
        <div className="grow bold">Nivel histórico</div>
        <b className="tnum">{ovr}</b>
      </div>
      <div className="row" style={{ padding: '6px 4px' }}>
        <div className="grow">
          Momento del club
          <div className="small muted">Puntos que suma o resta hoy a su nivel histórico</div>
        </div>
        <Stepper value={v.momentum} min={-15} max={15} onChange={(n) => setV({ ...v, momentum: n })} />
      </div>
      <button
        className="btn primary block"
        style={{ marginTop: 10 }}
        onClick={async () => {
          await db.teams.update(team.id, { ...v, ovr });
          ui.toast('Niveles guardados');
          onClose();
        }}
      >
        Guardar
      </button>
    </Sheet>
  );
}


/** Cara a cara contra cualquier equipo, con accesos directos a sus derbis. */
function TeamRivals({ team }: { team: Team }) {
  const { teams, leagues } = useWorld();
  const derbies = RIVALS[team.id] ?? [];
  const [rivalId, setRivalId] = useState<string>(derbies[0] ?? '');
  const h2h = useLiveQuery(() => (rivalId ? headToHead(team.id, rivalId) : undefined), [team.id, rivalId]);
  const seasons = useLiveQuery(() => db.seasons.toArray());
  const comps = useLiveQuery(() => db.competitions.toArray());
  const rival = teams.get(rivalId);
  return (
    <>
      {derbies.length > 0 && (
        <>
          <div className="section-title">Derbis y grandes rivales</div>
          <div className="chips">
            {derbies.map((id) => (
              <button key={id} className={`chip ${rivalId === id ? 'active' : ''}`} onClick={() => setRivalId(id)}>
                <Crest team={teams.get(id)} size={18} /> {teams.get(id)?.short}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="section-title">Elegir rival</div>
      <select
        value={rivalId}
        onChange={(e) => setRivalId(e.target.value)}
        style={{ width: '100%', height: 42, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', padding: '0 10px', marginBottom: 12 }}
      >
        <option value="">— Elige un equipo —</option>
        {leagues.map((l) => (
          <optgroup key={l.id} label={l.name}>
            {l.teams
              .filter((id) => id !== team.id)
              .map((id) => teams.get(id)!)
              .sort((a, b) => a.short.localeCompare(b.short))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.short}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {rival && h2h && (
        <>
          <HeadToHeadCard team={team} rival={rival} h2h={h2h} />
          {h2h.matches.length > 0 && (
            <div className="card list">
              {h2h.matches.slice(0, 30).map((m) => {
                const comp = comps?.find((c) => c.id === m.compId);
                const round = comp?.rounds.find((r) => r.round === m.round)?.label;
                const mine = m.homeId === team.id ? m.score![0] : m.score![1];
                const theirs = m.homeId === team.id ? m.score![1] : m.score![0];
                const res = mine > theirs ? 'V' : mine < theirs ? 'D' : 'E';
                const color = res === 'V' ? 'var(--win)' : res === 'D' ? 'var(--loss)' : 'var(--draw)';
                return (
                  <Link key={m.id} to={`/m/${m.id}`} className="row">
                    <span className="form-dot" style={{ background: color, width: 20, height: 20, fontSize: 10 }}>
                      {res}
                    </span>
                    <div className="grow">
                      <div className="ellipsis">
                        {teams.get(m.homeId)?.short} <b className="tnum">{m.score![0]}-{m.score![1]}</b> {teams.get(m.awayId)?.short}
                        {m.penalties ? ` (pen. ${m.penalties[0]}-${m.penalties[1]})` : ''}
                      </div>
                      <div className="small muted ellipsis">
                        {seasons?.find((x) => x.id === m.seasonId)?.label} · {comp?.name} · {round}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
      {!rival && <div className="card empty">Elige un rival para ver el historial de enfrentamientos</div>}
    </>
  );
}
