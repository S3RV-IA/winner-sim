import { useLiveQuery } from 'dexie-react-hooks';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { AppBar, Crest } from '../common';
import { Icon } from '../Icon';
import { COMP_COLORS, titleInfo } from '../labels';
import { useWorld } from '../world';

/** Muro de campeones de un título: el escudo del ganador de cada temporada, en orden, y quién lleva más. */
export function TitleWall() {
  const { key = '' } = useParams();
  const { teams, leagues } = useWorld();
  const info = titleInfo(key, (id) => leagues.find((l) => l.id === id)?.name ?? id);
  const trophies = useLiveQuery(() => db.trophies.filter((t) => t.compType === info.type).toArray(), [info.type]);
  const seasons = useLiveQuery(() => db.seasons.toArray());
  if (!trophies || !seasons) return null;

  // Los equipos no cambian de liga, así que su liga identifica de qué liga/copa/supercopa es cada trofeo
  const won = trophies.filter((t) => !info.leagueId || teams.get(t.teamId)?.leagueId === info.leagueId).sort((a, b) => a.seasonId - b.seasonId);
  const seasonLabel = (id: number) => (seasons.find((s) => s.id === id)?.label ?? '').slice(2);
  const active = seasons.find((s) => s.status === 'active');
  const pending = active && !won.some((t) => t.seasonId === active.id) ? active : undefined;

  const counts = new Map<string, { n: number; last: number }>();
  for (const t of won) counts.set(t.teamId, { n: (counts.get(t.teamId)?.n ?? 0) + 1, last: t.seasonId });
  const ranking = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last);

  return (
    <div className="screen">
      <AppBar title={info.name} subtitle="Campeones por temporada" back />
      <div className="content">
        <div className="wall" style={{ '--wall': COMP_COLORS[info.type] } as CSSProperties}>
          <div className="wall-head">
            <Icon name="trophy" size={30} color="#fff" />
            <div>
              <div className="wall-kicker">MURO DE CAMPEONES</div>
              <div className="wall-title">{info.name}</div>
            </div>
          </div>
          <div className="wall-grid">
            {won.map((t) => (
              <Link key={t.id ?? t.seasonId} to={`/t/${t.teamId}?tab=trophies`} className="wall-cell">
                <Crest team={teams.get(t.teamId)} size={40} />
                <span className="tnum">{seasonLabel(t.seasonId)}</span>
              </Link>
            ))}
            {pending && (
              <div className="wall-cell">
                <span className="wall-unknown">?</span>
                <span className="tnum">{pending.label.slice(2)}</span>
              </div>
            )}
          </div>
          {!won.length && <div className="wall-empty">Todavía no hay campeones: el primero aparecerá al cerrar la temporada.</div>}
        </div>

        {ranking.length > 0 && (
          <>
            <div className="section-title">Más títulos</div>
            <div className="card list">
              {ranking.map(([teamId, c], i) => {
                const t = teams.get(teamId);
                return (
                  <Link key={teamId} to={`/t/${teamId}?tab=trophies`} className="row">
                    <span className="small muted tnum" style={{ width: 20 }}>{i + 1}</span>
                    <Crest team={t} size={26} />
                    <div className="grow">
                      <div className="bold">{t?.short}</div>
                      <div className="small muted">Último: {seasons.find((s) => s.id === c.last)?.label}</div>
                    </div>
                    <b className="tnum" style={{ fontSize: 18 }}>{c.n}</b>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
