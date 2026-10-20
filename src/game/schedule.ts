import type { Rng } from '../engine/rng';

export type Pairing = [home: string, away: string];

/**
 * Calendario de liga a doble vuelta (método del círculo). La segunda vuelta repite los
 * cruces con los campos invertidos, en un orden distinto al de la primera.
 */
export function doubleRoundRobin(teamIds: string[], rng: Rng): Pairing[][] {
  const teams = rng.shuffle([...teamIds]);
  if (teams.length % 2) teams.push('BYE');
  const n = teams.length;
  const first: Pairing[][] = [];
  const rot = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    const circle = [teams[0], ...rot];
    for (let i = 0; i < n / 2; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      if (a === 'BYE' || b === 'BYE') continue;
      // Alternar local/visitante para que nadie encadene demasiados partidos en casa
      round.push((r + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(round);
    rot.unshift(rot.pop()!);
  }
  const second = first.map((round) => round.map(([h, a]) => [a, h] as Pairing));
  // La segunda vuelta empieza por una jornada distinta para que no sea un espejo exacto
  const offset = rng.int(1, Math.max(1, second.length - 2));
  return [...first, ...second.slice(offset), ...second.slice(0, offset)];
}

/**
 * Fase de liga europea (formato suizo) para 24 o 32 equipos: 4 bombos de N/4 y cada equipo
 * juega 2 rivales de cada bombo (uno en casa y otro fuera) → 8 jornadas.
 * Se construye por bloques para que cada jornada sea un emparejamiento completo:
 *  - 6 jornadas cruzan bombos (0-1 + 2-3, 0-2 + 1-3, 0-3 + 1-2), dos veces cada combinación
 *  - 2 jornadas enfrentan equipos del mismo bombo (un ciclo partido en dos)
 * Evita en lo posible cruces entre equipos de la misma liga.
 */
export function swissLeaguePhase(seeded: string[], leagueOf: (id: string) => string, rng: Rng): Pairing[][] {
  const n = seeded.length;
  if (n % 8 !== 0) throw new Error('La fase de liga necesita 24 o 32 equipos');
  const potSize = n / 4;
  const pots = [0, 1, 2, 3].map((p) => seeded.slice(p * potSize, (p + 1) * potSize));
  const clash = (pairs: Pairing[]) => pairs.filter(([a, b]) => leagueOf(a) === leagueOf(b)).length;

  /** Mejor de varios intentos aleatorios (menos cruces de la misma liga). */
  const best = <T>(make: () => T, score: (x: T) => number, tries = 300): T => {
    let top = make();
    let topScore = score(top);
    for (let i = 0; i < tries && topScore > 0; i++) {
      const x = make();
      const sc = score(x);
      if (sc < topScore) [top, topScore] = [x, sc];
    }
    return top;
  };

  // Dentro de cada bombo: un ciclo, dividido en dos jornadas
  const within = pots.map((pot) =>
    best(() => {
      const o = rng.shuffle([...pot]);
      const a: Pairing[] = [];
      const b: Pairing[] = [];
      o.forEach((t, k) => (k % 2 === 0 ? a : b).push([t, o[(k + 1) % o.length]]));
      return [a, b];
    }, ([a, b]) => clash(a) + clash(b)),
  );

  // Entre bombos: dos emparejamientos disjuntos (local del primero y local del segundo)
  const between = (i: number, j: number): [Pairing[], Pairing[]] =>
    best(() => {
      const m1 = rng.shuffle([...pots[j]]);
      let m2 = rng.shuffle([...pots[j]]);
      for (let t = 0; t < 50 && m2.some((x, k) => x === m1[k]); t++) m2 = rng.shuffle([...pots[j]]);
      if (m2.some((x, k) => x === m1[k])) m2 = [...m1.slice(1), m1[0]];
      return [pots[i].map((x, k) => [x, m1[k]] as Pairing), pots[i].map((x, k) => [m2[k], x] as Pairing)];
    }, ([a, b]) => clash(a) + clash(b));

  const rounds: Pairing[][] = [];
  for (const [[i, j], [k, l]] of [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]] as const) {
    const x = between(i, j);
    const y = between(k, l);
    rounds.push([...x[0], ...y[1]], [...x[1], ...y[0]]);
  }
  rounds.push(within.flatMap((w) => w[0]), within.flatMap((w) => w[1]));
  return rng.shuffle(rounds);
}
