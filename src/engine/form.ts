/**
 * Estado de forma (−1..1). Se mide contra lo ESPERADO: que un 98 pierda pesa mucho más
 * que si pierde un 74. La forma desplaza el nivel efectivo como mucho ±formImpact puntos.
 */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Forma del equipo tras un partido. `odds` = probabilidades previas [ganar, empatar, perder] desde su punto de vista. */
export function nextTeamForm(form: number, odds: [number, number, number], points: number): number {
  const expected = 3 * odds[0] + odds[1];
  const surprise = clamp((points - expected) / 1.5, -1, 1);
  return clamp(form * 0.75 + surprise * 0.25, -1, 1);
}

/** Nota esperada de un titular según su nivel. */
export const expectedRating = (ovr: number) => 6.8 + (ovr - 78) * 0.025;

/** Forma del jugador tras un partido en el que ha tenido nota. */
export function nextPlayerForm(form: number, rating: number, ovr: number): number {
  const surprise = clamp((rating - expectedRating(ovr)) / 1.2, -1, 1);
  return clamp(form * 0.8 + surprise * 0.2, -1, 1);
}

export interface SeasonCarryInput {
  finalForm: number;
  position: number;
  teams: number;
  /** Último puesto que da Champions / Europa League (0 = ninguno). */
  championsUntil: number;
  europaUntil: number;
  /** Número de puestos de descenso. */
  relegation: number;
  /** Ha ganado la Champions / la copa / la Europa League. */
  wonEurope?: boolean;
}

/** Forma con la que un equipo empieza la temporada siguiente. */
export function seasonStartTeamForm(i: SeasonCarryInput): number {
  let bonus = 0;
  if (i.position === 1) bonus = 0.35;
  else if (i.position <= i.championsUntil) bonus = 0.2;
  else if (i.position <= i.europaUntil) bonus = 0.1;
  else if (i.position > i.teams - i.relegation) bonus = -0.45;
  else if (i.position > i.teams / 2) bonus = -0.05;
  if (i.wonEurope) bonus += 0.15;
  return clamp(i.finalForm * 0.3 + bonus, -1, 1);
}

/** Forma inicial del jugador en la temporada siguiente según su nota media. */
export function seasonStartPlayerForm(avgRating: number, matches: number, ovr: number): number {
  if (matches < 8) return 0;
  return clamp(((avgRating - expectedRating(ovr)) / 0.6) * 0.5, -0.6, 0.6);
}
