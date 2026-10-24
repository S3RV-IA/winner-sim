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

/** Pausa en el reloj del directo entre partes (descanso y antes de la prórroga). */
const BREAK = 1;

/**
 * Reloj del directo: cada parte dura sus minutos más su añadido (el 90+4 tarda cuatro minutos en llegar),
 * con una pausa en el descanso y otra antes de la prórroga. `pos` sitúa un evento en ese reloj y `at` dice
 * qué minuto mostrar en cada instante.
 */
export function liveClock(events: MatchEvent[]) {
  const plusOf = (...labels: string[]) => events.find((e) => e.t === 'phase' && labels.includes(e.label))?.plus ?? 0;
  const extraTime = events.some((e) => e.min > 90);
  const parts = [
    { start: 0, from: 0, len: 45, plus: plusOf('HT'), after: 'Descanso' },
    // «ET» marca el final de los 90 en los partidos con prórroga (en los antiguos era «FT»)
    { start: 0, from: 45, len: 45, plus: plusOf('FT', 'ET'), after: extraTime ? "Final de los 90'" : 'Final' },
  ];
  if (extraTime) {
    // El añadido de la primera parte de la prórroga no tiene marca propia: se deduce del último evento en el 105+
    const firstEt = Math.max(0, ...events.filter((e) => e.min === 105).map((e) => e.plus ?? 0));
    parts.push({ start: 0, from: 90, len: 15, plus: firstEt, after: 'Descanso de la prórroga' });
    parts.push({ start: 0, from: 105, len: 15, plus: plusOf('AET'), after: 'Final' });
  }
  for (let k = 1; k < parts.length; k++) parts[k].start = parts[k - 1].start + parts[k - 1].len + parts[k - 1].plus + BREAK;

  const last = <T,>(xs: T[], ok: (x: T) => boolean) => [...xs].reverse().find(ok);
  const partOf = (min: number) => last(parts, (p) => min > p.from) ?? parts[0];
  return {
    pos(e: MatchEvent) {
      const p = e.t === 'phase' && e.label === 'HT' ? parts[0] : partOf(e.min);
      return p.start + Math.min(e.min - p.from, p.len) + (e.plus ?? 0);
    },
    at(clock: number): { label: string; minute: number } {
      const p = last(parts, (x) => clock >= x.start) ?? parts[0];
      const elapsed = clock - p.start;
      if (elapsed > p.len + p.plus) return { label: p.after, minute: p.from + p.len };
      if (elapsed <= p.len) return { label: `${p.from + Math.floor(elapsed)}'`, minute: p.from + elapsed };
      return { label: `${p.from + p.len}+${Math.ceil(elapsed - p.len)}'`, minute: p.from + p.len };
    },
  };
}
