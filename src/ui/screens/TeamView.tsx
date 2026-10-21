import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { computeStandings } from '../../game/standings';
import { avgRating } from '../../game/stats';
import type { CompType, Team } from '../../game/types';
import { AppBar, Crest, FormArrow, FormDots, MatchCard, Rating, Sheet, Stepper, Tabs, useTab, useUi } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';
import { TRAITS } from '../../game/traits';

type TeamTab = 'squad' | 'matches' | 'trophies';
const ROLE_ORDER = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];
const ROLE_GROUP: Record<string, string> = { GK: 'Porteros', CB: 'Defensas', LB: 'Defensas', RB: 'Defensas', DM: 'Centrocampistas', CM: 'Centrocampistas', AM: 'Centrocampistas', LW: 'Delanteros', RW: 'Delanteros', ST: 'Delanteros' };
export const COMP_TROPHY_LABEL: Record<CompType, string> = { league: 'Ligas', ucl: 'Champions League', uel: 'Europa League', cup: 'Copas' };

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
  const { teams, leagues, season } = useWorld();
  const team = teams.get(id!);
  const [tab, setTab] = useTab<TeamTab>('squad');
  const [edit, setEdit] = useState(false);
  const leagueComp = `${season.id}-league-${team?.leagueId}`;
  const leagueMatches = useLiveQuery(() => db.matches.where('compId').equals(leagueComp).toArray(), [leagueComp]);
  if (!team) return null;
  const league = leagues.find((l) => l.id === team.leagueId)!;
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
                {row && row.played ? `${pos + 1}.º · ${row.points} pts en ${row.played} partidos` : `Nivel general ${team.ovr}`}
              </div>
              {row && row.last.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <FormDots last={row.last} />
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800 }} className="tnum">
                {team.ovr}
              </div>
              <div className="small muted" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                forma <FormArrow form={team.form} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Bar label="Ataque" value={team.att} color="#ef4444" />
            <Bar label="Control" value={team.ctl} color="#3b82f6" />
            <Bar label="Defensa" value={team.def} color="#16a34a" />
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
          {Math.abs(team.form) >= 0.15 && (
            <div className="small muted" style={{ padding: '4px 12px 0' }}>
              Por su estado de forma juega ahora como un {Math.round(team.ovr + team.form * 3)} ({team.form > 0 ? '+' : ''}
              {(team.form * 3).toFixed(1)})
            </div>
          )}
        </div>

        {tab === 'squad' && <Squad team={team} />}
        {tab === 'matches' && <TeamMatches team={team} />}
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
              <MatchCard match={m} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function TeamTrophies({ team }: { team: Team }) {
  const trophies = useLiveQuery(() => db.trophies.where('teamId').equals(team.id).toArray(), [team.id]);
  const seasons = useLiveQuery(() => db.seasons.toArray());
  if (!trophies || !seasons) return null;
  const label = (sid: number) => seasons.find((s) => s.id === sid)?.label ?? '';
  const types: CompType[] = ['ucl', 'league', 'cup', 'uel'];
  return (
    <>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 }}>
        {types.map((t) => (
          <div key={t} className="card" style={{ padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800 }} className="tnum">
              {trophies.filter((x) => x.compType === t).length}
            </div>
            <div className="small muted">{COMP_TROPHY_LABEL[t]}</div>
          </div>
        ))}
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
  const [v, setV] = useState({ att: team.att, ctl: team.ctl, def: team.def });
  const ovr = Math.round((v.att + v.ctl + v.def) / 3);
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
        <div className="grow bold">Nivel general</div>
        <b className="tnum">{ovr}</b>
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

