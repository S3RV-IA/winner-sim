import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../db/db';
import type { PlayerSeason } from '../../game/types';
import { AppBar, Crest, Rating } from '../common';
import { useWorld } from '../world';

type View = 'goals' | 'assists' | 'bestGoals' | 'bestRating' | 'ballon';

/** Récords de toda la partida: goleadores históricos y mejores temporadas individuales. */
export function Records() {
  const { players, teams } = useWorld();
  const seasons = useLiveQuery(() => db.playerSeasons.toArray());
  const allSeasons = useLiveQuery(() => db.seasons.toArray());
  const ballons = useLiveQuery(() => db.awards.where('type').equals('ballonDor').toArray());
  const [view, setView] = useState<View>('goals');
  if (!seasons || !allSeasons || !ballons) return null;
  const label = (sid: number) => allSeasons.find((s) => s.id === sid)?.label ?? '';

  const career = new Map<string, { goals: number; assists: number; apps: number }>();
  for (const s of seasons) {
    const c = career.get(s.playerId) ?? { goals: 0, assists: 0, apps: 0 };
    c.goals += s.goals;
    c.assists += s.assists;
    c.apps += s.apps;
    career.set(s.playerId, c);
  }
  const ballonCount = new Map<string, number>();
  for (const b of ballons) ballonCount.set(b.playerId, (ballonCount.get(b.playerId) ?? 0) + 1);

  let rows: { key: string; playerId: string; teamId: string; main: number | string; sub: string; rating?: number }[] = [];
  if (view === 'goals' || view === 'assists')
    rows = [...career.entries()]
      .sort((a, b) => b[1][view] - a[1][view])
      .slice(0, 30)
      .map(([pid, c]) => ({ key: pid, playerId: pid, teamId: players.get(pid)?.teamId ?? '', main: c[view], sub: `${c.apps} partidos` }));
  else if (view === 'ballon')
    rows = [...ballonCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pid, n]) => ({ key: pid, playerId: pid, teamId: players.get(pid)?.teamId ?? '', main: n, sub: ballons.filter((b) => b.playerId === pid).map((b) => label(b.seasonId)).join(', ') }));
  else {
    const sorted: PlayerSeason[] =
      view === 'bestGoals'
        ? [...seasons].sort((a, b) => b.goals - a.goals || b.assists - a.assists)
        : [...seasons].filter((s) => s.apps >= 25).sort((a, b) => b.avgRating - a.avgRating);
    rows = sorted.slice(0, 30).map((s) => ({
      key: s.key, playerId: s.playerId, teamId: s.teamId, main: view === 'bestGoals' ? s.goals : '', rating: view === 'bestRating' ? s.avgRating : undefined,
      sub: `${label(s.seasonId)} · ${s.goals} G · ${s.assists} A · ${s.apps} PJ`,
    }));
  }

  return (
    <div className="screen">
      <AppBar title="Récords históricos" subtitle="Temporadas cerradas" back />
      <div className="content">
        <div className="chips">
          {(
            [
              ['goals', 'Goleadores'],
              ['assists', 'Asistentes'],
              ['bestGoals', 'Temporadas goleadoras'],
              ['bestRating', 'Mejores temporadas'],
              ['ballon', 'Balones de Oro'],
            ] as [View, string][]
          ).map(([id, l]) => (
            <button key={id} className={`chip ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
              {l}
            </button>
          ))}
        </div>
        <div className="card list" style={{ marginTop: 8 }}>
          {rows.map((r, i) => (
            <Link key={r.key} to={`/p/${r.playerId}`} className="row">
              <span className="muted tnum" style={{ width: 20 }}>
                {i + 1}
              </span>
              <Crest team={teams.get(r.teamId)} size={22} />
              <div className="grow">
                <div className="ellipsis">{players.get(r.playerId)?.name}</div>
                <div className="small muted ellipsis">{r.sub}</div>
              </div>
              {r.rating !== undefined ? <Rating value={r.rating} /> : <b className="tnum">{r.main}</b>}
            </Link>
          ))}
          {!rows.length && <div className="empty">Los récords aparecen cuando cierres la primera temporada.</div>}
        </div>
      </div>
    </div>
  );
}
