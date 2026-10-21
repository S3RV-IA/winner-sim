import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { resetMatch, setManualResult } from '../../game/simulate';
import type { MatchEvent, PlayerLine, ShotKind, TeamLine } from '../../engine/types';
import type { Match, StoredResult } from '../../game/types';
import { playOne } from '../actions';
import { AppBar, Crest, Rating, Sheet, Stepper, Tabs, useUi } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';

type MatchTab = 'summary' | 'stats' | 'players';

const KIND_LABEL: Record<ShotKind, string> = { pen: 'de penalti', big: '', head: 'de cabeza', box: '', out: 'desde fuera del área' };
export const minuteLabel = (e: { min: number; plus?: number }) => `${e.min}${e.plus ? `+${e.plus}` : ''}'`;

export function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const ui = useUi();
  const { teams } = useWorld();
  const match = useLiveQuery(() => db.matches.get(id!), [id]);
  const result = useLiveQuery(() => db.results.get(id!), [id, match?.playedOrder, match?.score?.join()]);
  const comp = useLiveQuery(() => (match ? db.competitions.get(match.compId) : undefined), [match?.compId]);
  const firstLeg = useLiveQuery(() => (match?.firstLegId ? db.matches.get(match.firstLegId) : undefined), [match?.firstLegId]);
  const [tab, setTab] = useState<MatchTab>('summary');
  const [manual, setManual] = useState(false);
  if (!match || !comp) return null;
  const home = teams.get(match.homeId)!;
  const away = teams.get(match.awayId)!;
  const round = comp.rounds.find((r) => r.round === match.round)!;
  const played = match.status === 'played';

  const simulate = async (live: boolean) => {
    await ui.run('Simulando partido…', () => playOne(match.id));
    if (live) nav(`/m/${match.id}/live`);
  };

  return (
    <div className="screen">
      <AppBar title={comp.name} subtitle={round.label} back />
      <div className="card" style={{ margin: 12, overflow: 'hidden' }}>
        <div className="scoreboard">
          <Link to={`/t/${home.id}`} className="team">
            <Crest team={home} size={64} />
            {home.short}
          </Link>
          <div>
            <div className="big tnum">{played && match.score ? `${match.score[0]}-${match.score[1]}` : 'vs'}</div>
            <div className="small muted" style={{ textAlign: 'center' }}>
              {played ? (match.penalties ? `Penaltis ${match.penalties[0]}-${match.penalties[1]}` : match.extraTime ? 'Tras prórroga' : 'Final') : 'Pendiente'}
            </div>
            {firstLeg?.score && (
              <div className="small muted" style={{ textAlign: 'center' }}>
                Ida {firstLeg.score[1]}-{firstLeg.score[0]}
                {played && match.score && ` · Global ${match.score[0] + firstLeg.score[1]}-${match.score[1] + firstLeg.score[0]}`}
              </div>
            )}
            {match.neutral && <div className="small muted" style={{ textAlign: 'center' }}>Campo neutral</div>}
          </div>
          <Link to={`/t/${away.id}`} className="team">
            <Crest team={away} size={64} />
            {away.short}
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 12px 14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!played ? (
            <>
              <button className="btn primary" onClick={() => simulate(false)}>
                <Icon name="dice" size={18} /> Resultado
              </button>
              <button className="btn primary" onClick={() => simulate(true)}>
                <Icon name="play" size={18} /> En directo
              </button>
              <button className="btn" onClick={() => setManual(true)}>
                <Icon name="edit" size={18} /> A mano
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => nav(`/m/${match.id}/live`)} disabled={!result || result.events.every((e) => e.t !== 'miss')}>
                <Icon name="play" size={18} /> Ver directo
              </button>
              <button className="btn" onClick={() => setManual(true)}>
                <Icon name="edit" size={18} /> Editar
              </button>
              <button
                className="btn"
                onClick={async () => {
                  if (!confirm('¿Deshacer este partido? Volverá a estar pendiente y se restarán sus estadísticas.')) return;
                  await ui.run('Deshaciendo…', () => resetMatch(match.id));
                }}
              >
                <Icon name="undo" size={18} /> Deshacer
              </button>
            </>
          )}
        </div>
      </div>

      {played && result && (
        <>
          <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'summary', label: 'Resumen', icon: 'list' },
                { id: 'stats', label: 'Estadísticas', icon: 'chart' },
                { id: 'players', label: 'Jugadores', icon: 'person' },
              ]}
            />
          </div>
          <div className="content" style={{ paddingTop: 12 }}>
            {tab === 'summary' && <Summary result={result} match={match} />}
            {tab === 'stats' && <TeamStats lines={result.teams} />}
            {tab === 'players' && <PlayersList result={result} match={match} />}
          </div>
        </>
      )}
      {played && !result && <div className="empty">Detalle no disponible</div>}

      <ManualSheet open={manual} onClose={() => setManual(false)} match={match} />
    </div>
  );
}

function ManualSheet({ open, onClose, match }: { open: boolean; onClose: () => void; match: Match }) {
  const ui = useUi();
  const { teams } = useWorld();
  const [score, setScore] = useState<[number, number]>(match.score ?? [0, 0]);
  useEffect(() => {
    if (open) setScore(match.score ?? [0, 0]);
  }, [open, match.score]);
  return (
    <Sheet open={open} onClose={onClose} title="Introducir resultado">
      {[0, 1].map((side) => {
        const t = teams.get(side === 0 ? match.homeId : match.awayId)!;
        return (
          <div key={side} className="row" style={{ padding: '8px 4px' }}>
            <Crest team={t} size={28} />
            <div className="grow bold">{t.short}</div>
            <Stepper value={score[side]} max={15} onChange={(v) => setScore(side === 0 ? [v, score[1]] : [score[0], v])} />
          </div>
        );
      })}
      <p className="small muted" style={{ margin: '8px 4px 14px' }}>
        El motor decide goleadores, asistencias, estadísticas y notas respetando este marcador.
        {match.knockout && ' Si hay empate en la eliminatoria, se juega prórroga y penaltis.'}
      </p>
      <button
        className="btn primary block"
        onClick={async () => {
          onClose();
          await ui.run('Guardando resultado…', () => setManualResult(match.id, score));
        }}
      >
        Guardar
      </button>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function useNames() {
  const { players } = useWorld();
  return (id?: string) => (id ? players.get(id)?.name ?? '?' : '');
}

export function EventLine({ e, homeFirst = true }: { e: MatchEvent; homeFirst?: boolean }) {
  const name = useNames();
  if (e.t === 'phase') {
    const label = { HT: 'Descanso', FT: 'Final del partido', ET: 'Prórroga', AET: 'Final de la prórroga', PENS: 'Tanda de penaltis' }[e.label];
    return <div className="phase">{label}</div>;
  }
  let content: React.ReactNode = null;
  if (e.t === 'goal')
    content = (
      <>
        <Icon name="ball" size={20} color="var(--accent-strong)" />
        <span>
          <b>{name(e.player)}</b>
          <span className="small muted">
            {' '}
            {e.kind !== 'box' && e.kind !== 'big' ? KIND_LABEL[e.kind] : ''}
            {e.assist ? ` · asist. ${name(e.assist)}` : ''}
          </span>
          <span className="small bold tnum"> ({e.score[0]}-{e.score[1]})</span>
        </span>
      </>
    );
  else if (e.t === 'card')
    content = (
      <>
        <span style={{ width: 11, height: 15, borderRadius: 2, background: e.color === 'Y' ? '#facc15' : '#dc2626', display: 'inline-block' }} />
        <span>{name(e.player)}</span>
      </>
    );
  else if (e.t === 'sub')
    content = (
      <>
        <Icon name="swap" size={16} color="var(--muted)" />
        <span className="small">
          <span style={{ color: 'var(--win)' }}>{name(e.in)}</span> <span className="muted">por {name(e.out)}</span>
        </span>
      </>
    );
  else if (e.t === 'miss')
    content = (
      <span className="small muted">
        {e.kind === 'pen' ? `Penalti fallado por ${name(e.player)}` : e.kind === 'big' ? `Ocasión clara de ${name(e.player)}` : `Tiro de ${name(e.player)}`}
        {' · '}
        {e.outcome === 'saved' ? `parada de ${name(e.keeper)}` : e.outcome === 'post' ? 'al palo' : e.outcome === 'blocked' ? 'bloqueado' : 'fuera'}
      </span>
    );
  const side = homeFirst ? e.side : 1 - e.side;
  return (
    <div className={`event ${e.t === 'goal' ? 'goal' : ''}`}>
      <div className="home">{side === 0 && content}</div>
      <div className="min">{minuteLabel(e)}</div>
      <div className="away">{side === 1 && content}</div>
    </div>
  );
}

function Summary({ result, match }: { result: StoredResult; match: Match }) {
  const { players, teams } = useWorld();
  const [all, setAll] = useState(false);
  const important = result.events.filter((e) => e.t !== 'miss' || (all ? true : e.kind === 'pen'));
  const mvp = result.players.find((p) => p.id === result.mvp);
  const mvpPlayer = mvp ? players.get(mvp.id) : undefined;
  return (
    <>
      {mvp && mvpPlayer && (
        <Link to={`/p/${mvp.id}`} className="card row" style={{ marginBottom: 12 }}>
          <Icon name="star" color="var(--accent)" />
          <div className="grow">
            <div className="small muted">Mejor jugador</div>
            <div className="bold">{mvpPlayer.name}</div>
          </div>
          <Crest team={teams.get(mvpPlayer.teamId)} size={22} />
          <Rating value={mvp.rating} />
        </Link>
      )}
      <div className="card list" style={{ overflow: 'hidden' }}>
        {important.map((e, i) => (
          <EventLine key={i} e={e} />
        ))}
        {result.penalties && (
          <div style={{ padding: 10 }}>
            {result.penalties.kicks.map((k, i) => (
              <div key={i} className="event" style={{ minHeight: 30 }}>
                <div className="home">{k.side === 0 && <span className="small">{players.get(k.player)?.name} {k.scored ? '✅' : '❌'}</span>}</div>
                <div className="min">{Math.floor(i / 2) + 1}</div>
                <div className="away">{k.side === 1 && <span className="small">{k.scored ? '✅' : '❌'} {players.get(k.player)?.name}</span>}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {result.events.some((e) => e.t === 'miss') && (
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>
          {all ? 'Solo lo importante' : 'Ver todas las ocasiones'}
        </button>
      )}
      <div className="small muted" style={{ textAlign: 'center', marginTop: 12 }}>
        Probabilidades previas: {teams.get(match.homeId)?.short} {Math.round(result.odds[0] * 100)}% · empate {Math.round(result.odds[1] * 100)}% · {teams.get(match.awayId)?.short}{' '}
        {Math.round(result.odds[2] * 100)}%
      </div>
    </>
  );
}

export function TeamStats({ lines }: { lines: [TeamLine, TeamLine] }) {
  const [h, a] = lines;
  const pct = (t: TeamLine) => (t.passes ? Math.round((100 * t.passesOk) / t.passes) : 0);
  const rows: [string, number, number, string?][] = [
    ['Posesión', h.possession, a.possession, '%'],
    ['Goles esperados (xG)', h.xg, a.xg],
    ['Tiros', h.shots, a.shots],
    ['Tiros a puerta', h.shotsOn, a.shotsOn],
    ['Ocasiones claras', h.bigChances, a.bigChances],
    ['Paradas', h.saves, a.saves],
    ['Pases', h.passes, a.passes],
    ['Precisión de pase', pct(h), pct(a), '%'],
    ['Regates completados', h.dribbles, a.dribbles],
    ['Córners', h.corners, a.corners],
    ['Amarillas', h.yellow, a.yellow],
    ['Rojas', h.red, a.red],
  ];
  return (
    <div className="card list">
      {rows.map(([label, x, y, unit]) => {
        const tot = x + y || 1;
        return (
          <div key={label} className="stat-row">
            <div className="stat-head">
              <b className="tnum">
                {x}
                {unit}
              </b>
              <span className="muted">{label}</span>
              <b className="tnum">
                {y}
                {unit}
              </b>
            </div>
            <div className="stat-bars">
              <div>
                <span style={{ width: `${(100 * x) / tot}%`, background: x >= y ? 'var(--accent)' : 'var(--draw)' }} />
              </div>
              <div>
                <span style={{ width: `${(100 * y) / tot}%`, background: y >= x ? 'var(--accent)' : 'var(--draw)' }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayersList({ result, match }: { result: StoredResult; match: Match }) {
  const { teams } = useWorld();
  const [side, setSide] = useState<0 | 1>(0);
  const lines = result.players.filter((l) => l.side === side);
  const starters = lines.filter((l) => l.starter);
  const subs = lines.filter((l) => !l.starter);
  if (!lines.length) return <div className="empty">Detalle de jugadores no disponible (temporada archivada)</div>;
  return (
    <>
      <div className="chips">
        {[0, 1].map((s) => (
          <button key={s} className={`chip ${side === s ? 'active' : ''}`} onClick={() => setSide(s as 0 | 1)}>
            <Crest team={teams.get(s === 0 ? match.homeId : match.awayId)} size={18} />
            {teams.get(s === 0 ? match.homeId : match.awayId)?.short}
          </button>
        ))}
      </div>
      <div className="section-title">Titulares</div>
      <div className="card list">
        {starters.map((l) => (
          <PlayerLineRow key={l.id} l={l} />
        ))}
      </div>
      {subs.length > 0 && (
        <>
          <div className="section-title">Suplentes</div>
          <div className="card list">
            {subs.map((l) => (
              <PlayerLineRow key={l.id} l={l} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function PlayerLineRow({ l }: { l: PlayerLine }) {
  const { players } = useWorld();
  const [open, setOpen] = useState(false);
  const p = players.get(l.id);
  return (
    <div>
      <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <span className="small muted tnum" style={{ width: 24 }}>
          {p?.number ?? ''}
        </span>
        <div className="grow">
          <div className="ellipsis">
            {p?.name}
            {' '}
            {l.goals > 0 && '⚽'.repeat(Math.min(l.goals, 4))}
            {l.assists > 0 && ' 🅰️'.repeat(Math.min(l.assists, 3))}
            {l.yellow > 0 && ' 🟨'}
            {l.red > 0 && ' 🟥'}
          </div>
          <div className="small muted">
            {l.role} · {l.minutes}'
          </div>
        </div>
        <Rating value={l.rating} />
      </button>
      {open && (
        <div className="small" style={{ padding: '0 12px 12px 46px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
          <span>Tiros: {l.shots} ({l.shotsOn} a puerta)</span>
          <span>Ocasiones falladas: {l.bigMissed}</span>
          <span>Pases: {l.passesOk}/{l.passes}{l.passes ? ` (${Math.round((100 * l.passesOk) / l.passes)}%)` : ''}</span>
          <span>Pases clave: {l.keyPasses}</span>
          <span>Regates: {l.dribbles}/{l.dribbles + l.dribblesFailed}</span>
          <span>Acciones defensivas: {l.defActions}</span>
          {(l.blocks ?? 0) > 0 && <span>Tiros bloqueados: {l.blocks}</span>}
          {l.role === 'GK' && <span>Paradas: {l.saves}</span>}
          {l.penGoals + l.penMissed > 0 && <span>Penaltis: {l.penGoals}/{l.penGoals + l.penMissed}</span>}
          <Link to={`/p/${l.id}`} style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>
            Ver jugador →
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directo: reproduce los eventos minuto a minuto
// ---------------------------------------------------------------------------

export function LiveView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { teams } = useWorld();
  const match = useLiveQuery(() => db.matches.get(id!), [id]);
  const result = useLiveQuery(() => db.results.get(id!), [id]);
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number>();

  // Secuencia: cada evento con su "instante" (minuto + añadido) para ordenarlos en el tiempo
  const timeline = useMemo(() => {
    if (!result) return [];
    // El añadido se comprime dentro del minuto (45+7 sigue antes del 46)
    return result.events.map((e, i) => ({ e, t: e.min + (e.plus ?? 0) * 0.09 + i * 0.0001 }));
  }, [result]);
  const end = timeline.length ? timeline[timeline.length - 1].t + 0.5 : 90;

  useEffect(() => {
    if (paused || clock >= end) return;
    timer.current = window.setTimeout(() => setClock((c) => Math.min(end, c + 0.25)), 250 / speed);
    return () => window.clearTimeout(timer.current);
  }, [clock, paused, speed, end]);

  if (!match || !result) return null;
  const home = teams.get(match.homeId)!;
  const away = teams.get(match.awayId)!;
  const shown = timeline.filter((x) => x.t <= clock).map((x) => x.e);
  const score: [number, number] = [0, 0];
  const shots: [number, number] = [0, 0];
  const onTarget: [number, number] = [0, 0];
  for (const e of shown) {
    if (e.t === 'goal') {
      score[e.side]++;
      shots[e.side]++;
      onTarget[e.side]++;
    } else if (e.t === 'miss') {
      shots[e.side]++;
      if (e.outcome === 'saved') onTarget[e.side]++;
    }
  }
  const finished = clock >= end;
  const lastPhase = [...shown].reverse().find((e) => e.t === 'phase');
  const displayMin = Math.min(Math.floor(clock), result.extraTime ? 120 : 90);

  return (
    <div className="screen">
      <AppBar title="En directo" subtitle={`${home.short} – ${away.short}`} back />
      <div className="card" style={{ margin: 12 }}>
        <div className="scoreboard">
          <div className="team">
            <Crest team={home} size={56} />
            {home.short}
          </div>
          <div>
            <div className="big tnum">
              {score[0]}-{score[1]}
            </div>
            <div className="bold tnum" style={{ textAlign: 'center', color: finished ? 'var(--muted)' : 'var(--win)' }}>
              {finished ? 'Final' : lastPhase?.t === 'phase' && lastPhase.label === 'HT' && clock < 46 ? 'Descanso' : `${displayMin}'`}
            </div>
          </div>
          <div className="team">
            <Crest team={away} size={56} />
            {away.short}
          </div>
        </div>
        <div className="small muted tnum" style={{ textAlign: 'center', paddingBottom: 12 }}>
          Tiros {shots[0]} ({onTarget[0]}) · {shots[1]} ({onTarget[1]})
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingBottom: 14 }}>
          {!finished && (
            <button className="btn" onClick={() => setPaused(!paused)}>
              <Icon name={paused ? 'play' : 'pause'} size={18} />
            </button>
          )}
          {!finished &&
            [1, 2, 4].map((s) => (
              <button key={s} className={`btn ${speed === s ? 'primary' : ''}`} onClick={() => setSpeed(s)}>
                x{s}
              </button>
            ))}
          {!finished ? (
            <button className="btn" onClick={() => setClock(end)}>
              <Icon name="forward" size={18} /> Final
            </button>
          ) : (
            <button className="btn primary" onClick={() => nav(`/m/${match.id}`, { replace: true })}>
              Ver estadísticas
            </button>
          )}
        </div>
      </div>
      <div className="content" style={{ paddingTop: 0 }}>
        <div className="card list" style={{ overflow: 'hidden' }}>
          {[...shown].reverse().map((e, i) => (
            <EventLine key={shown.length - i} e={e} />
          ))}
          {!shown.length && <div className="empty">¡Empieza el partido!</div>}
        </div>
      </div>
    </div>
  );
}
