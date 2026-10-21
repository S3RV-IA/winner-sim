import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { expectedRating } from '../../engine/form';
import { avgRating } from '../../game/stats';
import { AppBar, Crest, FormArrow, Rating } from '../common';
import { Icon } from '../Icon';
import { AWARD_NAMES } from '../labels';
import { useWorld } from '../world';
import { Bar } from './TeamView';

const ROLE_NAMES: Record<string, string> = {
  GK: 'Portero', CB: 'Central', LB: 'Lateral izquierdo', RB: 'Lateral derecho', DM: 'Mediocentro defensivo', CM: 'Centrocampista',
  AM: 'Mediapunta', LW: 'Extremo izquierdo', RW: 'Extremo derecho', ST: 'Delantero centro',
};

export function PlayerView() {
  const { id } = useParams();
  const { players, teams, season } = useWorld();
  const p = players.get(id!);
  const stats = useLiveQuery(() => db.stats.where('playerId').equals(id!).filter((s) => s.seasonId === season.id).toArray(), [id, season.id]);
  const comps = useLiveQuery(() => db.competitions.where('seasonId').equals(season.id).toArray(), [season.id]);
  const history = useLiveQuery(() => db.playerSeasons.where('playerId').equals(id!).toArray(), [id]);
  const awards = useLiveQuery(() => db.awards.where('playerId').equals(id!).toArray(), [id]);
  const seasons = useLiveQuery(() => db.seasons.toArray());
  if (!p || !stats || !comps || !history || !awards || !seasons) return null;
  const team = teams.get(p.teamId)!;
  const label = (sid: number) => seasons.find((s) => s.id === sid)?.label ?? '';

  const total = stats.reduce(
    (a, s) => {
      a.apps += s.apps; a.goals += s.goals; a.assists += s.assists; a.minutes += s.minutes; a.ratingSum += s.ratingSum; a.rated += s.rated;
      a.shots += s.shots; a.shotsOn += s.shotsOn; a.bigMissed += s.bigMissed; a.penGoals += s.penGoals; a.penMissed += s.penMissed;
      a.headGoals += s.headGoals; a.outGoals += s.outGoals; a.keyPasses += s.keyPasses; a.dribbles += s.dribbles; a.dribblesFailed += s.dribblesFailed;
      a.passes += s.passes; a.passesOk += s.passesOk; a.defActions += s.defActions; a.blocks += s.blocks ?? 0; a.saves += s.saves; a.cleanSheets += s.cleanSheets;
      a.yellow += s.yellow; a.red += s.red; a.motm += s.motm;
      return a;
    },
    { apps: 0, goals: 0, assists: 0, minutes: 0, ratingSum: 0, rated: 0, shots: 0, shotsOn: 0, bigMissed: 0, penGoals: 0, penMissed: 0, headGoals: 0, outGoals: 0, keyPasses: 0, dribbles: 0, dribblesFailed: 0, passes: 0, passesOk: 0, defActions: 0, blocks: 0, saves: 0, cleanSheets: 0, yellow: 0, red: 0, motm: 0 },
  );
  const isGk = p.role === 'GK';
  const attrs: [string, number][] = isGk
    ? [['Portería', p.gk], ['Pase', p.pas], ['Juego aéreo', p.hea], ['Velocidad', p.pac ?? 0]]
    : [['Velocidad', p.pac ?? 0], ['Definición', p.fin], ['Disparo lejano', p.lng], ['Cabeza', p.hea], ['Regate', p.dri], ['Pase', p.pas], ['Creación', p.cre], ['Defensa', p.def]];

  const detail: [string, string | number][] = [
    ['Partidos', `${total.apps} (${total.minutes}')`],
    ['Goles', total.goals],
    ['Asistencias', total.assists],
    ['MVP del partido', total.motm],
    ...(isGk
      ? ([['Paradas', total.saves], ['Porterías a cero', total.cleanSheets]] as [string, number][])
      : ([
          ['Tiros (a puerta)', `${total.shots} (${total.shotsOn})`],
          ['Ocasiones claras falladas', total.bigMissed],
          ['Goles de cabeza', total.headGoals],
          ['Goles desde fuera del área', total.outGoals],
          ['Penaltis', `${total.penGoals}/${total.penGoals + total.penMissed}`],
          ['Pases clave', total.keyPasses],
          ['Regates', `${total.dribbles}/${total.dribbles + total.dribblesFailed}`],
          ['Acciones defensivas', total.defActions],
          ['Tiros bloqueados', total.blocks],
        ] as [string, string | number][])),
    ['Pases (precisión)', `${total.passesOk}/${total.passes}${total.passes ? ` · ${Math.round((100 * total.passesOk) / total.passes)}%` : ''}`],
    ['Tarjetas', `${total.yellow} 🟨 · ${total.red} 🟥`],
  ];

  return (
    <div className="screen">
      <AppBar title={p.name} subtitle={team.short} back />
      <div className="content">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 58, height: 58, borderRadius: 14, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800 }} className="tnum">
              {p.number ?? '–'}
            </div>
            <div className="grow">
              <div className="bold" style={{ fontSize: 17 }}>
                {p.name}
              </div>
              <Link to={`/t/${team.id}`} className="small" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <Crest team={team} size={16} /> {team.name}
              </Link>
              <div className="small muted" style={{ marginTop: 3 }}>
                {ROLE_NAMES[p.role]} · {p.nat}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800 }} className="tnum">
                {p.ovr}
              </div>
              <div className="small muted" style={{ display: 'flex', alignItems: 'center' }}>
                forma <FormArrow form={p.form} />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            {attrs.map(([l, v]) => (
              <Bar key={l} label={l} value={v} />
            ))}
          </div>
        </div>

        <div className="section-title">Temporada {season.label}</div>
        <div className="card list">
          <div className="row">
            <div className="grow bold">Nota media</div>
            <span className="small muted">esperada {expectedRating(p.ovr).toFixed(2)}</span>
            <Rating value={total.rated ? total.ratingSum / total.rated : 0} />
          </div>
          {detail.map(([k, v]) => (
            <div key={k} className="row" style={{ minHeight: 40 }}>
              <div className="grow">{k}</div>
              <b className="tnum">{v}</b>
            </div>
          ))}
        </div>

        {stats.length > 0 && (
          <>
            <div className="section-title">Por competición</div>
            <div className="card list">
              {stats.map((s) => (
                <Link key={s.key} to={`/c/${s.compId}?tab=stats`} className="row">
                  <div className="grow">
                    <div>{comps.find((c) => c.id === s.compId)?.name}</div>
                    <div className="small muted">
                      {s.apps} PJ · {s.goals} G · {s.assists} A
                    </div>
                  </div>
                  <Rating value={avgRating(s)} />
                </Link>
              ))}
            </div>
          </>
        )}

        {awards.length > 0 && (
          <>
            <div className="section-title">Premios</div>
            <div className="card list">
              {awards
                .sort((a, b) => b.seasonId - a.seasonId)
                .map((a) => (
                  <div key={a.id} className="row">
                    <Icon name={a.type === 'ballonDor' ? 'star' : 'medal'} color="var(--accent)" />
                    <div className="grow">{AWARD_NAMES[a.type]}</div>
                    <span className="small muted">{label(a.seasonId)}</span>
                  </div>
                ))}
            </div>
          </>
        )}

        {history.length > 0 && (
          <>
            <div className="section-title">Trayectoria</div>
            <div className="card list">
              {history
                .sort((a, b) => b.seasonId - a.seasonId)
                .map((h) => (
                  <div key={h.key} className="row">
                    <div className="grow">
                      <div className="bold">{label(h.seasonId)}</div>
                      <div className="small muted">
                        {h.apps} PJ · {h.goals} G · {h.assists} A · {h.motm} MVP
                      </div>
                    </div>
                    <Rating value={h.avgRating} />
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
