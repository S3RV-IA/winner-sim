import { Link } from 'react-router-dom';
import type { MatchEvent, PlayerLine, TeamLine } from '../engine/types';
import type { Match, StoredResult } from '../game/types';
import { Crest, Rating } from './common';
import { Icon } from './Icon';
import { KIND_LABEL, minuteLabel } from './labels';
import { ROLE_ORDER } from './liveStats';
import { useWorld } from './world';

// Piezas de la ficha de partido que también usa el directo.

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
            {e.counter ? 'al contraataque' : e.kind !== 'box' && e.kind !== 'big' ? KIND_LABEL[e.kind] : ''}
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
        {e.kind === 'pen'
          ? `Penalti fallado por ${name(e.player)}`
          : e.counter
            ? `Contraataque de ${name(e.player)}`
            : e.kind === 'big'
              ? `Ocasión clara de ${name(e.player)}`
              : `Tiro de ${name(e.player)}`}
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

/** Rasgos históricos que estuvieron activos en el partido (p. ej. «Noches mágicas del Bernabéu»). */
export function TraitBadges({ result, match }: { result: StoredResult; match: Match }) {
  const { teams } = useWorld();
  if (!result.traits) return null;
  const items = result.traits.flatMap((labels, side) => labels.map((l) => ({ l, team: teams.get(side === 0 ? match.homeId : match.awayId) })));
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: '0 12px 12px' }}>
      {items.map(({ l, team }) => (
        <span key={l + team?.id} className="chip" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <Crest team={team} size={16} />✨ {l}
        </span>
      ))}
    </div>
  );
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
