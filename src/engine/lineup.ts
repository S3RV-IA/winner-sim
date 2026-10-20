import type { Rng } from './rng';
import type { Role, SimPlayer } from './types';

/** Huecos del 4-3-3 y qué roles encajan en cada uno (1 = posición natural). */
const SLOTS: { slot: Role; fit: Partial<Record<Role, number>> }[] = [
  { slot: 'GK', fit: { GK: 1 } },
  { slot: 'RB', fit: { RB: 1, LB: 0.86, CB: 0.82, DM: 0.72, RW: 0.7 } },
  { slot: 'CB', fit: { CB: 1, DM: 0.85, RB: 0.8, LB: 0.8 } },
  { slot: 'CB', fit: { CB: 1, DM: 0.85, RB: 0.8, LB: 0.8 } },
  { slot: 'LB', fit: { LB: 1, RB: 0.86, CB: 0.82, DM: 0.72, LW: 0.7 } },
  { slot: 'DM', fit: { DM: 1, CM: 0.96, CB: 0.82, AM: 0.8 } },
  { slot: 'CM', fit: { CM: 1, DM: 0.96, AM: 0.95, LW: 0.75, RW: 0.75 } },
  { slot: 'AM', fit: { AM: 1, CM: 0.97, LW: 0.88, RW: 0.88, ST: 0.84 } },
  { slot: 'RW', fit: { RW: 1, LW: 0.95, AM: 0.9, ST: 0.86, RB: 0.7 } },
  { slot: 'ST', fit: { ST: 1, LW: 0.88, RW: 0.88, AM: 0.84 } },
  { slot: 'LW', fit: { LW: 1, RW: 0.95, AM: 0.9, ST: 0.86, LB: 0.7 } },
];

export interface LineupPlayer {
  player: SimPlayer;
  /** Puesto que ocupa en el campo. */
  role: Role;
}

export interface Lineup {
  starters: LineupPlayer[];
  bench: SimPlayer[];
}

/** Valor con el que el "entrenador" elige: nivel, forma y algo de rotación. */
const pickScore = (p: SimPlayer, rng: Rng) => p.ovr + p.form * 3 + rng.normal(0, 2.2);

export function chooseLineup(players: SimPlayer[], rng: Rng, unavailable: ReadonlySet<string> = new Set()): Lineup {
  const pool = players.filter((p) => !unavailable.has(p.id));
  const score = new Map(pool.map((p) => [p.id, pickScore(p, rng)]));
  const candidates: { slot: number; p: SimPlayer; value: number }[] = [];
  SLOTS.forEach((s, slot) => {
    for (const p of pool) {
      const fit = s.fit[p.role];
      if (fit) candidates.push({ slot, p, value: score.get(p.id)! * fit });
    }
  });
  candidates.sort((a, b) => b.value - a.value);

  const filled = new Array<SimPlayer | null>(SLOTS.length).fill(null);
  const used = new Set<string>();
  for (const c of candidates) {
    if (filled[c.slot] || used.has(c.p.id)) continue;
    filled[c.slot] = c.p;
    used.add(c.p.id);
  }
  // Plantillas cortas: cualquier jugador de campo libre ocupa los huecos que queden
  SLOTS.forEach((_, i) => {
    if (filled[i]) return;
    const spare = pool.filter((p) => !used.has(p.id) && (i === 0) === (p.role === 'GK')).sort((a, b) => b.ovr - a.ovr)[0]
      ?? pool.filter((p) => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr)[0];
    if (spare) {
      filled[i] = spare;
      used.add(spare.id);
    }
  });

  const starters = filled.flatMap((p, i) => (p ? [{ player: p, role: SLOTS[i].slot }] : []));
  const rest = pool.filter((p) => !used.has(p.id)).sort((a, b) => score.get(b.id)! - score.get(a.id)!);
  const benchGk = rest.find((p) => p.role === 'GK');
  const bench = [...(benchGk ? [benchGk] : []), ...rest.filter((p) => p !== benchGk && p.role !== 'GK').slice(0, 8)];
  return { starters, bench };
}

/** Lo bien que encaja un suplente en el puesto de quien sale. */
export function fitFor(role: Role, p: SimPlayer): number {
  const s = SLOTS.find((x) => x.slot === role);
  return s?.fit[p.role] ?? 0.6;
}
