import { useLiveQuery } from 'dexie-react-hooks';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { podiumOf, type Podium } from '../../game/podium';
import type { CompType, Trophy } from '../../game/types';
import { AppBar, Crest, useUrlParam } from '../common';
import { Icon } from '../Icon';
import { COMP_COLORS, COMP_TROPHY_LABEL, titleInfo } from '../labels';
import { useWorld } from '../world';

type View = 'first' | 'second' | 'third' | 'podium';
const VIEWS: [View, string][] = [
  ['first', 'Campeón'],
  ['second', 'Subcampeón'],
  ['third', 'Tercero'],
  ['podium', 'Podio'],
];
const KICKER: Record<View, string> = { first: 'MURO DE CAMPEONES', second: 'MURO DE SUBCAMPEONES', third: 'MURO DE TERCEROS', podium: 'PODIO POR TEMPORADA' };
/** Orden de los iconos de títulos de una temporada (de más a menos importante). */
const TITLE_ORDER: CompType[] = ['ucl', 'league', 'cup', 'uel', 'uecl', 'supercup', 'uefasuper'];

/**
 * Muro de campeones de un título: el escudo de cada temporada (campeón, subcampeón o tercero) con los títulos
 * que ese club ganó aquel año, para ver de un vistazo quién dominó cada temporada.
 */
export function TitleWall() {
  const { key = '' } = useParams();
  const { teams, leagues } = useWorld();
  const [viewParam, setView] = useUrlParam('view');
  const view = (viewParam as View) || 'first';
  const info = titleInfo(key, (id) => leagues.find((l) => l.id === id)?.name ?? id);
  const podiums = useLiveQuery(async () => {
    const comps = await db.competitions
      .filter((c) => c.type === info.type && c.status === 'finished' && (!info.leagueId || c.leagueId === info.leagueId))
      .toArray();
    return (await Promise.all(comps.map(podiumOf))).filter((p) => p.first).sort((a, b) => a.seasonId - b.seasonId);
  }, [key]);
  const trophies = useLiveQuery(() => db.trophies.toArray());
  const seasons = useLiveQuery(() => db.seasons.toArray());
  if (!podiums || !trophies || !seasons) return null;

  const seasonLabel = (id: number) => (seasons.find((s) => s.id === id)?.label ?? '').slice(2);
  const active = seasons.find((s) => s.status === 'active');
  const pending = view === 'first' && active && !podiums.some((p) => p.seasonId === active.id) ? active : undefined;
  // Títulos de cada club en cada temporada, y los ganados en los despachos
  const titlesOf = (seasonId: number, teamId?: string) =>
    trophies.filter((t) => t.seasonId === seasonId && t.teamId === teamId).sort((a, b) => TITLE_ORDER.indexOf(a.compType) - TITLE_ORDER.indexOf(b.compType));
  const bySanction = (p: Podium) => trophies.some((t) => t.seasonId === p.seasonId && t.compType === info.type && t.teamId === p.first && t.bySanction);
  const shownTypes = new Set<CompType>();
  const spot = (p: Podium) => (view === 'first' ? [p.first!] : view === 'second' ? (p.second ? [p.second] : []) : p.third);

  const counts = new Map<string, { n: number; last: number }>();
  for (const p of podiums) for (const id of view === 'podium' ? [p.first!] : spot(p)) counts.set(id, { n: (counts.get(id)?.n ?? 0) + 1, last: p.seasonId });
  const ranking = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last);

  const dots = (seasonId: number, teamId?: string) => {
    const list = titlesOf(seasonId, teamId);
    for (const t of list) shownTypes.add(t.compType);
    return <TitleDots list={list} />;
  };

  return (
    <div className="screen">
      <AppBar title={info.name} subtitle="Campeones por temporada" back />
      <div className="content">
        <div className="chips" style={{ marginBottom: 10 }}>
          {VIEWS.map(([v, label]) => (
            <button key={v} className={`chip ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>

        <div className="wall" style={{ '--wall': COMP_COLORS[info.type] } as CSSProperties}>
          <div className="wall-head">
            <Icon name="trophy" size={30} color="#fff" />
            <div>
              <div className="wall-kicker">{KICKER[view]}</div>
              <div className="wall-title">{info.name}</div>
            </div>
          </div>

          {view === 'podium' ? (
            <div className="podium-list">
              {[...podiums].reverse().map((p) => (
                <div key={p.seasonId} className="podium-season-block">
                  <div className="podium-season tnum">
                    {seasonLabel(p.seasonId)}
                    {bySanction(p) ? '*' : ''}
                  </div>
                  {/* Una fila por club: puesto, escudo, nombre y, a su lado, todos los títulos que ganó esa temporada */}
                  {([[1, p.first!], ...(p.second ? [[2, p.second]] : []), ...p.third.map((id) => [3, id])] as [number, string][]).map(([place, id]) => (
                    <Link key={`${place}-${id}`} to={`/t/${id}?tab=trophies`} className="podium-line">
                      <span className={`podium-medal place-${place}`}>{place}</span>
                      <Crest team={teams.get(id)} size={22} />
                      <span className="podium-name ellipsis">{teams.get(id)?.short}</span>
                      {dots(p.seasonId, id)}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="wall-grid">
              {podiums.map((p) => {
                const ids = spot(p);
                if (!ids.length) return null;
                return (
                  <div key={p.seasonId} className="wall-cell">
                    <div style={{ display: 'flex', gap: 2 }}>
                      {ids.map((id) => (
                        <Link key={id} to={`/t/${id}?tab=trophies`}>
                          <Crest team={teams.get(id)} size={ids.length > 1 ? 24 : 40} />
                        </Link>
                      ))}
                    </div>
                    {/* Asterisco: título ganado en los despachos por una sanción al campeón */}
                    <span className="tnum">
                      {seasonLabel(p.seasonId)}
                      {view === 'first' && bySanction(p) ? '*' : ''}
                    </span>
                    {ids.length === 1 && dots(p.seasonId, ids[0])}
                  </div>
                );
              })}
              {pending && (
                <div className="wall-cell">
                  <span className="wall-unknown">?</span>
                  <span className="tnum">{pending.label.slice(2)}</span>
                </div>
              )}
            </div>
          )}

          {shownTypes.size > 0 && (
            <div className="wall-legend">
              {TITLE_ORDER.filter((t) => shownTypes.has(t)).map((t) => (
                <span key={t}>
                  <Icon name="trophy" size={11} color={COMP_COLORS[t]} /> {COMP_TROPHY_LABEL[t]}
                </span>
              ))}
            </div>
          )}
          {view === 'third' && info.type !== 'league' && podiums.length > 0 && <div className="wall-empty">En eliminatorias, el tercer puesto lo comparten los dos semifinalistas</div>}
          {view === 'first' && podiums.some(bySanction) && <div className="wall-empty">* Título concedido en los despachos por sanción al campeón</div>}
          {!podiums.length && <div className="wall-empty">Todavía no hay campeones: el primero aparecerá al cerrar la temporada.</div>}
        </div>

        {ranking.length > 0 && (
          <>
            <div className="section-title">{view === 'second' ? 'Más subcampeonatos' : view === 'third' ? 'Más veces terceros' : 'Más títulos'}</div>
            <div className="card list">
              {ranking.map(([teamId, c], i) => {
                const t = teams.get(teamId);
                return (
                  <Link key={teamId} to={`/t/${teamId}?tab=trophies`} className="row">
                    <span className="small muted tnum" style={{ width: 20 }}>{i + 1}</span>
                    <Crest team={t} size={26} />
                    <div className="grow">
                      <div className="bold">{t?.short}</div>
                      <div className="small muted">Última vez: {seasons.find((s) => s.id === c.last)?.label}</div>
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

/** Títulos que un club ganó en una temporada, como trofeos pequeños del color de cada competición. */
function TitleDots({ list }: { list: Trophy[] }) {
  if (!list.length) return null;
  return (
    <span className="title-dots" title={list.map((t) => t.compName).join(' · ')}>
      {list.map((t) => (
        <Icon key={t.id} name="trophy" size={13} color={COMP_COLORS[t.compType]} />
      ))}
    </span>
  );
}
