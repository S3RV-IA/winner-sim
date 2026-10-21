import { useEffect, useState } from 'react';
import type { MatchEvent, Role, ShotKind, TeamLine } from '../engine/types';
import type { StoredResult } from '../game/types';

const KIND_XG: Record<ShotKind, number> = { pen: 0.78, big: 0.4, head: 0.09, box: 0.1, out: 0.04 };

export const ROLE_ORDER: Role[] = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];

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
