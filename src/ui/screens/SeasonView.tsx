import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import type { Award, AwardType, LeagueId } from '../../game/types';
import { AppBar, Crest } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';
import { Standings } from './Competition';
import { FLAGS } from '../labels';
import { AWARD_NAMES } from '../labels';

/** Resumen de una temporada cerrada: campeones, premios y clasificaciones finales. */
export function SeasonView() {
  const { id } = useParams();
  const sid = Number(id);
  const { teams, players, leagues, config } = useWorld();
  const season = useLiveQuery(() => db.seasons.get(sid), [sid]);
  const comps = useLiveQuery(() => db.competitions.where('seasonId').equals(sid).toArray(), [sid]);
  const awards = useLiveQuery(() => db.awards.where('seasonId').equals(sid).toArray(), [sid]);
  const archive = useLiveQuery(() => db.archives.get(sid), [sid]);
  const [league, setLeague] = useState<LeagueId>('esp');
  if (!season || !comps || !awards) return null;

  const award = (type: AwardType, leagueId?: LeagueId) => awards.find((a) => a.type === type && a.leagueId === leagueId);
  const ballon = award('ballonDor');
  const order = ['ucl', 'uel', 'league', 'cup'];

  return (
    <div className="screen">
      <AppBar title={`Temporada ${season.label}`} subtitle={season.status === 'finished' ? 'Cerrada' : 'En juego'} back />
      <div className="content">
        {ballon && <Ranking award={ballon} title="Balón de Oro" big />}

        <div className="section-title">Campeones</div>
        <div className="card list">
          {comps
            .filter((c) => c.championId)
            .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
            .map((c) => (
              <Link key={c.id} to={`/c/${c.id}`} className="row">
                <Icon name="trophy" color={c.type === 'ucl' ? '#1d4ed8' : 'var(--accent)'} />
                <div className="grow">
                  <div className="small muted">{c.name}</div>
                  <div className="bold ellipsis">{teams.get(c.championId!)?.name}</div>
                </div>
                <Crest team={teams.get(c.championId!)} size={28} />
              </Link>
            ))}
        </div>

        <div className="section-title">Premios</div>
        <div className="card list">
          {(['goldenBoot', 'uclMvp', 'uclTopScorer', 'bestGoalkeeper'] as AwardType[]).map((t) => {
            const a = award(t);
            if (!a) return null;
            const p = players.get(a.playerId);
            return (
              <Link key={t} to={`/p/${a.playerId}`} className="row">
                <Icon name="medal" color="var(--accent)" />
                <div className="grow">
                  <div className="small muted">{AWARD_NAMES[t]}</div>
                  <div className="bold ellipsis">{p?.name}</div>
                </div>
                <span className="small muted">{a.ranking?.[0]?.detail ?? a.value}</span>
                <Crest team={teams.get(a.teamId)} size={22} />
              </Link>
            );
          })}
        </div>

        <div className="section-title">Por liga</div>
        <div className="chips">
          {leagues.map((l) => (
            <button key={l.id} className={`chip ${league === l.id ? 'active' : ''}`} onClick={() => setLeague(l.id)}>
              {FLAGS[l.id]} {l.name}
            </button>
          ))}
        </div>
        <div className="card list" style={{ marginTop: 6 }}>
          {(['leagueMvp', 'leagueTopScorer', 'leagueTopAssists'] as AwardType[]).map((t) => {
            const a = award(t, league);
            if (!a) return null;
            return (
              <Link key={t} to={`/p/${a.playerId}`} className="row">
                <div className="grow">
                  <div className="small muted">{AWARD_NAMES[t]}</div>
                  <div className="bold ellipsis">{players.get(a.playerId)?.name}</div>
                </div>
                <b className="tnum">{t === 'leagueMvp' ? a.ranking?.[0]?.detail : a.value}</b>
                <Crest team={teams.get(a.teamId)} size={22} />
              </Link>
            );
          })}
        </div>
        {archive?.tables[league] && (
          <div className="card" style={{ overflow: 'hidden', marginTop: 10 }}>
            <Standings
              rows={archive.tables[league]}
              teams={teams}
              zoneColor={(pos) => {
                const z = config.zones[league];
                const n = archive.tables[league].length;
                return pos <= z.ucl ? 'var(--ucl)' : pos <= z.ucl + z.uel ? 'var(--uel)' : pos > n - z.rel ? 'var(--rel)' : undefined;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Ranking({ award, title, big }: { award: Award; title: string; big?: boolean }) {
  const { players, teams } = useWorld();
  const winner = players.get(award.playerId);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <Link to={`/p/${award.playerId}`} style={{ display: 'block', padding: 16, textAlign: 'center', background: big ? 'linear-gradient(135deg, #ffcd38, #f59e0b)' : undefined, color: big ? '#1f1f1f' : undefined }}>
        <div className="small bold">{title.toUpperCase()}</div>
        <div style={{ fontSize: 22, fontWeight: 800, margin: '6px 0' }}>{winner?.name}</div>
        <div className="small" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          <Crest team={teams.get(award.teamId)} size={18} /> {teams.get(award.teamId)?.name} · {award.ranking?.[0]?.detail}
        </div>
      </Link>
      <div className="list">
        {award.ranking?.slice(1).map((r, i) => (
          <Link key={r.playerId} to={`/p/${r.playerId}`} className="row" style={{ minHeight: 40 }}>
            <span className="muted tnum" style={{ width: 20 }}>
              {i + 2}
            </span>
            <Crest team={teams.get(r.teamId)} size={20} />
            <div className="grow ellipsis">{players.get(r.playerId)?.name}</div>
            <span className="small muted">{r.detail}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
