import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { resetMatch, setManualResult } from '../../game/simulate';
import type { PlayerLine } from '../../engine/types';
import type { Match, StoredResult } from '../../game/types';
import { playOne } from '../actions';
import { AppBar, Crest, Rating, Sheet, Stepper, Tabs, TieStrip, useUi } from '../common';
import { Icon } from '../Icon';
import { useWide } from '../liveStats';
import { EventLine, HeadToHeadCard, LineupPanel, Prediction, TeamStats, TeamStatusCard, TraitBadges } from '../MatchParts';
import { headToHead, previewMatch, teamSnapshot } from '../../game/preview';
import { useWorld } from '../world';

type MatchTab = 'summary' | 'stats' | 'players';

export function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const ui = useUi();
  const { teams, config } = useWorld();
  const match = useLiveQuery(() => db.matches.get(id!), [id]);
  const result = useLiveQuery(() => db.results.get(id!), [id, match?.playedOrder, match?.score?.join()]);
  const comp = useLiveQuery(() => (match ? db.competitions.get(match.compId) : undefined), [match?.compId]);
  const firstLeg = useLiveQuery(() => (match?.firstLegId ? db.matches.get(match.firstLegId) : undefined), [match?.firstLegId]);
  const [tab, setTab] = useState<MatchTab>('summary');
  const wide = useWide();
  const [manual, setManual] = useState(false);
  const h2h = useLiveQuery(() => (match ? headToHead(match.homeId, match.awayId) : undefined), [match?.homeId, match?.awayId, match?.status]);
  const snaps = useLiveQuery(
    () => (match && match.status !== 'played' ? Promise.all([teamSnapshot(teams.get(match.homeId)!, match.seasonId), teamSnapshot(teams.get(match.awayId)!, match.seasonId)]) : undefined),
    [match?.id, match?.status],
  );
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
      <div className="card" style={{ margin: '12px auto', maxWidth: 720, overflow: 'hidden', marginLeft: wide ? 'auto' : 12, marginRight: wide ? 'auto' : 12 }}>
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

            {match.neutral && <div className="small muted" style={{ textAlign: 'center' }}>Campo neutral</div>}
          </div>
          <Link to={`/t/${away.id}`} className="team">
            <Crest team={away} size={64} />
            {away.short}
          </Link>
        </div>
        {firstLeg?.score && (
          <div style={{ padding: '0 16px 12px' }}>
            <TieStrip match={match} firstLeg={firstLeg} />
          </div>
        )}
        {played && result && <TraitBadges result={result} match={match} />}
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

      {!played && (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 12px' }}>
          <Prediction preview={previewMatch(match, comp, home, away, firstLeg, config)} home={home} away={away} />
          {snaps && <TeamStatusCard home={home} away={away} snaps={snaps} />}
          {h2h &&<HeadToHeadCard team={home} rival={away} h2h={h2h} />}
        </div>
      )}
      {played && result && wide && (
        <div className="wide-wrap" style={{ paddingTop: 0 }}>
          <div className="side-grid">
            <aside className="side-panel">
              <h4>Estadísticas</h4>
              <TeamStats lines={result.teams} />
            </aside>
            <main style={{ minWidth: 0 }}>
              <Summary result={result} match={match} />
            </main>
            <aside className="side-panel">
              <h4>Alineaciones y notas</h4>
              <LineupPanel match={match} result={result} shown={result.events} finished />
            </aside>
          </div>
        </div>
      )}
      {played && result && !wide && (
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
      {played && h2h && (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 12px 12px' }}>
          <HeadToHeadCard team={home} rival={away} h2h={h2h} title="CARA A CARA (INCLUIDO ESTE PARTIDO)" />
        </div>
      )}

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

