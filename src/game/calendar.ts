/**
 * Calendario de la temporada: cada partido tiene un `slot` = semana * 10 + día.
 * Día 2 Champions · 3 Copa · 4 Europa League · 6 Liga. Agosto = semana 1, final de Champions = semana 43.
 */
export const DAY = { ucl: 2, cup: 3, uel: 4, uecl: 5, league: 6 } as const;
export const slot = (week: number, day: number) => week * 10 + day;

/** Semanas de liga: 38 jornadas (o 34) repartidas entre la semana 1 y la 41 con parones. */
export function leagueWeeks(rounds: number): number[] {
  const breaks = new Set([7, 12]); // parones de selecciones
  const weeks = Array.from({ length: 41 }, (_, i) => i + 1).filter((w) => !breaks.has(w));
  // Repartir las jornadas de forma uniforme entre las semanas disponibles
  return Array.from({ length: rounds }, (_, r) => weeks[Math.round((r * (weeks.length - 1)) / (rounds - 1))]);
}

/** Semanas europeas: 8 jornadas de fase de liga, playoff, octavos, cuartos, semis y final. */
export const EURO_WEEKS = {
  league: [4, 7, 9, 12, 14, 17, 21, 22],
  playoff: [25, 26],
  r16: [28, 29],
  qf: [32, 33],
  sf: [36, 37],
  final: 43,
};

/** Supercopas: las de final única abren la temporada (semana 0); las de 4 equipos se juegan en enero. */
export const SUPER_WEEKS = { single: 0, semis: 21, final: 22, uefa: 2 };

/** Conference League: octavos, cuartos y semifinales a ida y vuelta, y final. */
export const UECL_WEEKS = { r16: [28, 29], qf: [32, 33], sf: [36, 37], final: 42 };

/** Semanas de copa nacional: octavos, cuartos, semifinal y final (partido único). */
export const CUP_WEEKS = { r16: 18, qf: 24, sf: 31, final: 38 };

export const weekOf = (s: number) => Math.floor(s / 10);

const MONTHS = ['ago', 'sep', 'oct', 'nov', 'dic', 'ene', 'feb', 'mar', 'abr', 'may', 'jun'];
/** Mes aproximado de una semana (semana 1 ≈ mediados de agosto). */
export const monthOf = (week: number) => MONTHS[Math.min(MONTHS.length - 1, Math.floor((week + 1) / 4.35))];
