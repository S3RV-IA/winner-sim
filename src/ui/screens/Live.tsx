import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import type { MatchEvent, PenaltyKick, PlayerLine, Role, ShotKind, TeamLine } from '../../engine/types';
import type { Match, StoredResult } from '../../game/types';
import { ChanceOverlay, isDramatic } from '../ChanceOverlay';
import { AppBar, Crest, Rating } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';
import { EventLine, TeamStats, TraitBadges } from './MatchView';

const KIND_XG: Record<ShotKind, number> = { pen: 0.78, big: 0.4, head: 0.09, box: 0.1, out: 0.04 };
const ROLE_ORDER: Role[] = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

/** Pantalla ancha (portátil): paneles laterales en lugar de pestañas. */
export function useWide(min = 1000) {
  const query = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

/** Estadísticas de equipo hasta el momento: lo contable sale de los eventos; el resto se reparte según el tiempo. */
export function liveTeamLines(result: StoredResult, shown: MatchEvent[], fraction: number): [TeamLine, TeamLine] {
  const lines = result.teams.map((t) => ({
    ...t,
    goals: 0, xg: 0, shots: 0, shotsOn: 0, bigChances: 0, saves: 0, yellow: 0, red: 0,
    passes: Math.round(t.passes * fraction),
    passesOk: Math.round(t.passesOk * fraction),
    dribbles: Math.round(t.dribbles * fraction),
    corners: Math.round(t.corners * fraction),
  })) as [TeamLine, TeamLine];
  for (const e of shown) {
    if (e.t === 'goal' || e.t === 'miss') {
      const l = lines[e.side];
      l.shots++;
      l.xg += e.xg ?? KIND_XG[e.kind];
      if (e.kind === 'big' || e.kind === 'pen') l.bigChances++;
      if (e.t === 'goal') {
        l.goals++;
        l.shotsOn++;
      } else if (e.outcome === 'saved') {
        l.shotsOn++;
        lines[1 - e.side].saves++;
      }
    } else if (e.t === 'card') lines[e.side][e.color === 'Y' ? 'yellow' : 'red']++;
  }
  for (const l of lines) l.xg = Math.round(l.xg * 100) / 100;
  return lines;
}

/** Alineaciones con lo que ha hecho cada jugador hasta el momento (goles, asistencias, tarjetas y cambios). */
export function LineupPanel({ match, result, shown, finished }: { match: Match; result: StoredResult; shown: MatchEvent[]; finished: boolean }) {
  const { teams, players } = useWorld();
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const cards = new Map<string, 'Y' | 'R'>();
  const subOff = new Map<string, string>();
  const subOn = new Map<string, string>();
  for (const e of shown) {
    if (e.t === 'goal') {
      goals.set(e.player, (goals.get(e.player) ?? 0) + 1);
      if (e.assist) assists.set(e.assist, (assists.get(e.assist) ?? 0) + 1);
    } else if (e.t === 'card') cards.set(e.player, e.color); // la doble amarilla llega como un evento rojo aparte
    else if (e.t === 'sub') {
      subOff.set(e.out, `${e.min}'`);
      subOn.set(e.in, `${e.min}'`);
    }
  }
  const row = (l: PlayerLine) => {
    const p = players.get(l.id);
    const off = subOff.has(l.id) || cards.get(l.id) === 'R';
    return (
      <Link key={l.id} to={`/p/${l.id}`} className={`lineup-row ${off ? 'off' : ''}`}>
        <span className="muted tnum" style={{ width: 20, textAlign: 'right' }}>
          {p?.number ?? ''}
        </span>
        <span className="grow ellipsis">
          {p?.name}
          {' '}
          {'⚽'.repeat(Math.min(goals.get(l.id) ?? 0, 4))}
          {'🅰️'.repeat(Math.min(assists.get(l.id) ?? 0, 3))}
          {cards.get(l.id) === 'Y' && '🟨'}
          {cards.get(l.id) === 'R' && '🟥'}
        </span>
        {subOff.has(l.id) && <span className="small" style={{ color: 'var(--loss)' }}>▼{subOff.get(l.id)}</span>}
        {subOn.has(l.id) && <span className="small" style={{ color: 'var(--win)' }}>▲{subOn.get(l.id)}</span>}
        {finished && <Rating value={l.rating} />}
      </Link>
    );
  };
  if (!result.players.some((l) => l.starter)) return <div className="card empty small">Alineaciones no disponibles (temporada archivada)</div>;
  return (
    <>
      {[0, 1].map((side) => {
        const t = teams.get(side === 0 ? match.homeId : match.awayId);
        const mine = result.players.filter((l) => l.side === side);
        const starters = mine.filter((l) => l.starter).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
        const entered = mine.filter((l) => !l.starter && subOn.has(l.id));
        return (
          <div key={side} className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            <div className="row" style={{ minHeight: 42 }}>
              <Crest team={t} size={22} />
              <b className="grow ellipsis">{t?.short}</b>
            </div>
            <div className="list">
              {starters.map(row)}
              {entered.map(row)}
            </div>
          </div>
        );
      })}
    </>
  );
}

type NarrowTab = 'feed' | 'stats' | 'lineups';

function readPref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* almacenamiento no disponible: la preferencia dura solo esta sesión */
  }
}

/** Directo: reproduce el partido minuto a minuto y para el reloj en cada ocasión peligrosa. */
export function LiveView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { teams, players } = useWorld();
  const wide = useWide();
  const match = useLiveQuery(() => db.matches.get(id!), [id]);
  const result = useLiveQuery(() => db.results.get(id!), [id]);
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [animations, setAnimations] = useState(() => readPref('winner.animations', true));
  const [chance, setChance] = useState<number | null>(null);
  const [handled] = useState(() => new Set<number>());
  const [tab, setTab] = useState<NarrowTab>('feed');
  // Tanda de penaltis: lanzamientos ya mostrados y lanzamiento que se está animando
  const [kicksShown, setKicksShown] = useState(0);
  const [kickAnim, setKickAnim] = useState<number | null>(null);

  // Cada evento con su instante: el añadido se comprime dentro del minuto (45+7 sigue antes del 46)
  const timeline = useMemo(() => (result ? result.events.map((e, i) => ({ e, i, t: e.min + (e.plus ?? 0) * 0.09 + i * 0.0001 })) : []), [result]);
  const end = timeline.length ? timeline[timeline.length - 1].t + 0.5 : 90;
  const kicks = result?.penalties?.kicks ?? [];
  const clockDone = clock >= end;
  const inShootout = clockDone && kicksShown < kicks.length;
  const finished = clockDone && !inShootout;

  // Tanda de penaltis lanzamiento a lanzamiento (con animación o con una pausa entre cada uno)
  useEffect(() => {
    if (!inShootout || paused || kickAnim !== null) return;
    if (animations) {
      const t = window.setTimeout(() => setKickAnim(kicksShown), 600 / speed);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setKicksShown((k) => k + 1), 900 / speed);
    return () => window.clearTimeout(t);
  }, [inShootout, paused, kickAnim, animations, kicksShown, speed]);

  useEffect(() => {
    if (paused || clockDone || chance !== null || !timeline.length) return;
    const timer = window.setTimeout(() => {
      const next = Math.min(end, clock + 0.25);
      const dramatic = animations ? timeline.find((x) => x.t > clock && x.t <= next && !handled.has(x.i) && isDramatic(x.e)) : undefined;
      if (dramatic) {
        // Parar justo antes de la ocasión: el resultado se revela en la animación
        setClock(dramatic.t - 0.00005);
        setChance(dramatic.i);
      } else setClock(next);
    }, 250 / speed);
    return () => window.clearTimeout(timer);
  }, [clock, paused, speed, end, clockDone, chance, animations, timeline, handled]);

  if (!match || !result) return null;
  const home = teams.get(match.homeId)!;
  const away = teams.get(match.awayId)!;
  const shown = timeline.filter((x) => x.t <= clock).map((x) => x.e);
  const score: [number, number] = [0, 0];
  for (const e of shown) if (e.t === 'goal') score[e.side]++;
  const regularEnd = result.extraTime ? 120 : 90;
  const fraction = Math.min(1, clock / regularEnd);
  const live = liveTeamLines(result, shown, fraction);
  const halfTime = clock > 45.7 && clock < 46 && shown.some((e) => e.t === 'phase' && e.label === 'HT');
  const displayMin = Math.min(Math.floor(clock), regularEnd);
  const chanceEvent = chance !== null ? result.events[chance] : null;
  const shownKicks = kicks.slice(0, kicksShown);
  const pens: [number, number] = [0, 0];
  for (const k of shownKicks) if (k.scored) pens[k.side]++;
  /** Portero rival en la tanda: el que más minutos jugó. */
  const keeperOf = (side: 0 | 1) =>
    result.players.filter((l) => l.side === side && l.role === 'GK').sort((a, b) => b.minutes - a.minutes)[0]?.id;
  /** Cada lanzamiento como una ocasión de penalti para reutilizar la animación. */
  const kickEvent = (i: number): Extract<MatchEvent, { t: 'goal' | 'miss' }> => {
    const k = kicks[i];
    const sc: [number, number] = [0, 0];
    for (const x of kicks.slice(0, i + 1)) if (x.scored) sc[x.side]++;
    return k.scored
      ? { t: 'goal', min: 120, side: k.side, player: k.player, kind: 'pen', score: sc }
      : { t: 'miss', min: 120, side: k.side, player: k.player, kind: 'pen', outcome: i % 3 === 0 ? 'off' : 'saved', keeper: keeperOf((1 - k.side) as 0 | 1) };
  };

  const finishChance = () => {
    if (chance === null) return;
    handled.add(chance);
    const t = timeline[chance].t;
    setChance(null);
    setClock((c) => Math.max(c, t));
  };

  const stats = (
    <aside className={wide ? 'side-panel' : undefined}>
      {wide && <h4>Estadísticas en directo</h4>}
      <TeamStats lines={live} />
    </aside>
  );
  const lineups = (
    <aside className={wide ? 'side-panel' : undefined}>
      {wide && <h4>Alineaciones</h4>}
      <LineupPanel match={match} result={result} shown={shown} finished={finished} />
    </aside>
  );
  const feed = (
    <div className="card list" style={{ overflow: 'hidden' }}>
      {[...shownKicks].reverse().map((k, j) => {
        const i = shownKicks.length - 1 - j;
        return (
          <div key={`k${i}`} className={`event ${k.scored ? 'goal' : ''}`}>
            <div className="home">{k.side === 0 && <span className="small">{players.get(k.player)?.name} {k.scored ? '✅' : '❌'}</span>}</div>
            <div className="min">P{i + 1}</div>
            <div className="away">{k.side === 1 && <span className="small">{k.scored ? '✅' : '❌'} {players.get(k.player)?.name}</span>}</div>
          </div>
        );
      })}
      {[...shown].reverse().map((e, i) => (
        <EventLine key={shown.length - i} e={e} />
      ))}
      {!shown.length && <div className="empty">¡Empieza el partido!</div>}
    </div>
  );

  return (
    <div className="screen">
      <AppBar title="En directo" subtitle={`${home.short} – ${away.short}`} back />
      <div className={wide ? 'wide-wrap' : 'content'} style={wide ? undefined : { paddingTop: 12 }}>
        <div className="side-grid">
          {wide && stats}
          <main style={{ minWidth: 0 }}>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="scoreboard">
                <Link to={`/t/${home.id}`} className="team">
                  <Crest team={home} size={56} />
                  {home.short}
                </Link>
                <div>
                  <div className="big tnum">
                    {score[0]}-{score[1]}
                  </div>
                  <div className="bold tnum" style={{ textAlign: 'center', color: finished ? 'var(--muted)' : 'var(--win)' }}>
                    {kicks.length && clockDone
                      ? `${finished ? 'Final · ' : ''}Penaltis ${pens[0]}-${pens[1]}`
                      : finished
                        ? 'Final'
                        : halfTime
                          ? 'Descanso'
                          : `${displayMin}'`}
                  </div>
                </div>
                <Link to={`/t/${away.id}`} className="team">
                  <Crest team={away} size={56} />
                  {away.short}
                </Link>
              </div>
              <TraitBadges result={result} match={match} />
              {kicks.length > 0 && clockDone && <ShootoutBoard kicks={kicks} shown={kicksShown} homeName={home.short} awayName={away.short} />}
              {!finished && (
                <div className="progress" style={{ margin: '0 16px 12px' }}>
                  <span style={{ width: `${(100 * clock) / end}%` }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', padding: '0 12px 14px' }}>
                {!finished && (
                  <button className="btn" onClick={() => setPaused(!paused)} aria-label={paused ? 'Reanudar' : 'Pausar'}>
                    <Icon name={paused ? 'play' : 'pause'} size={18} />
                  </button>
                )}
                {!finished &&
                  [1, 2, 4].map((s) => (
                    <button key={s} className={`btn ${speed === s ? 'primary' : ''}`} onClick={() => setSpeed(s)}>
                      x{s}
                    </button>
                  ))}
                {!finished && (
                  <button
                    className={`btn ${animations ? 'primary' : ''}`}
                    onClick={() => {
                      setAnimations(!animations);
                      writePref('winner.animations', !animations);
                    }}
                    title="Parar el reloj en las ocasiones peligrosas"
                  >
                    <Icon name="ball" size={18} /> Ocasiones
                  </button>
                )}
                {!finished ? (
                  <button
                    className="btn"
                    onClick={() => {
                      setChance(null);
                      setClock(end);
                      // Si hay tanda, primero se salta a los penaltis (para verlos); el segundo toque la termina
                      if (!kicks.length || clockDone) {
                        setKickAnim(null);
                        setKicksShown(kicks.length);
                      }
                    }}
                  >
                    <Icon name="forward" size={18} /> {kicks.length && !clockDone ? 'A los penaltis' : 'Final'}
                  </button>
                ) : (
                  <button className="btn primary" onClick={() => nav(`/m/${match.id}`, { replace: true })}>
                    Ver ficha del partido
                  </button>
                )}
              </div>
            </div>

            {!wide && (
              <div className="chips" style={{ marginBottom: 6 }}>
                {(
                  [
                    ['feed', 'Narración'],
                    ['stats', 'Estadísticas'],
                    ['lineups', 'Alineaciones'],
                  ] as [NarrowTab, string][]
                ).map(([t, label]) => (
                  <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {wide || tab === 'feed' ? feed : tab === 'stats' ? stats : lineups}
          </main>
          {wide && lineups}
        </div>
      </div>

      {kickAnim !== null && kicks[kickAnim] && (
        <ChanceOverlay
          key={`kick${kickAnim}`}
          event={kickEvent(kickAnim)}
          team={kicks[kickAnim].side === 0 ? home : away}
          shooter={players.get(kicks[kickAnim].player)?.name ?? ''}
          keeper={(() => {
            const gk = keeperOf((1 - kicks[kickAnim].side) as 0 | 1);
            return gk ? players.get(gk)?.name : undefined;
          })()}
          speed={speed}
          title="TANDA DE PENALTIS"
          subtitle={`Lanzamiento ${Math.floor(kickAnim / 2) + 1} · ${(kicks[kickAnim].side === 0 ? home : away).short} · ${pens[0]}-${pens[1]}`}
          onDone={() => {
            setKickAnim(null);
            setKicksShown((n) => Math.max(n, kickAnim + 1));
          }}
        />
      )}
      {chanceEvent && (chanceEvent.t === 'goal' || chanceEvent.t === 'miss') && (
        <ChanceOverlay
          key={chance}
          event={chanceEvent}
          team={chanceEvent.side === 0 ? home : away}
          shooter={players.get(chanceEvent.player)?.name ?? ''}
          keeper={chanceEvent.keeper ? players.get(chanceEvent.keeper)?.name : undefined}
          speed={speed}
          onDone={finishChance}
        />
      )}
    </div>
  );
}

/** Marcador de la tanda: un círculo por lanzamiento (verde gol, rojo fallo, gris pendiente). */
function ShootoutBoard({ kicks, shown, homeName, awayName }: { kicks: PenaltyKick[]; shown: number; homeName: string; awayName: string }) {
  const rounds = Math.max(5, Math.ceil(kicks.length / 2));
  const row = (side: 0 | 1, name: string) => {
    const mine = kicks.map((k, i) => ({ k, i })).filter((x) => x.k.side === side);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="small bold ellipsis" style={{ width: 90 }}>
          {name}
        </span>
        {Array.from({ length: rounds }, (_, r) => {
          const kick = mine[r];
          const done = kick && kick.i < shown;
          const bg = !done ? 'var(--surface-2)' : kick.k.scored ? 'var(--win)' : 'var(--loss)';
          return <span key={r} style={{ width: 16, height: 16, borderRadius: '50%', background: bg, display: 'inline-block' }} />;
        })}
      </div>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: '0 12px 12px' }}>
      {row(0, homeName)}
      {row(1, awayName)}
    </div>
  );
}
