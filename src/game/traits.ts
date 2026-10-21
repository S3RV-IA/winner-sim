import { NO_BOOST, type TeamBoost } from '../engine/types';
import type { CompType, LeagueId } from './types';

/** Situación del partido desde el punto de vista de un equipo. */
export interface TraitContext {
  comp: CompType;
  leagueId?: LeagueId;
  home: boolean;
  neutral: boolean;
  final: boolean;
  /** Cualquier partido de eliminatoria (ida, vuelta, partido único o final). */
  knockout: boolean;
  secondLeg: boolean;
  /** Es la vuelta y perdió la ida. */
  lostFirstLeg: boolean;
  /** El rival tiene al menos 3 puntos más de nivel. */
  underdog: boolean;
}

interface TraitEffect {
  /** Aumento relativo de la probabilidad de ganar (0.2 = +20 %). */
  win?: number;
  ctl?: number;
  def?: number;
  possession?: number;
  lateRally?: number;
  header?: number;
  counter?: number;
}

export interface Trait {
  name: string;
  description: string;
  when: (c: TraitContext) => boolean;
  effect: TraitEffect;
}

const europe = (c: TraitContext) => c.comp === 'ucl' || c.comp === 'uel';
const domestic = (c: TraitContext) => c.comp === 'league' || c.comp === 'cup';

/**
 * Rasgos históricos de los clubes. Los porcentajes de victoria se traducen en goles esperados
 * (×(1+0,95·win) propios y ×(1−0,47·win) del rival), calibrado para que +20 % ≈ un 20 % más de probabilidad de ganar.
 */
export const TRAITS: Record<string, Trait[]> = {
  'esp-rma': [
    {
      name: 'Noches mágicas del Bernabéu',
      description: 'Vuelta de Champions en casa tras perder la ida: +20 % de probabilidad de ganar.',
      when: (c) => c.comp === 'ucl' && c.secondLeg && c.home && c.lostFirstLeg,
      effect: { win: 0.2 },
    },
    {
      name: 'Letales a la contra',
      description: 'Cuando juega con poca posesión o le están dominando: más ocasiones y más claras al contraataque.',
      when: () => true,
      effect: { counter: 1.1 },
    },
    {
      name: 'ADN de finales',
      description: 'En cualquier final: +10 % de probabilidad de ganar.',
      when: (c) => c.final,
      effect: { win: 0.1 },
    },
  ],
  'esp-bar': [
    {
      name: 'Dueños del balón',
      description: 'En todos los partidos: +20 % de dominio del balón (posesión) y algo más de control.',
      when: () => true,
      effect: { possession: 1.2, ctl: 4 },
    },
  ],
  'esp-atm': [
    {
      name: 'Cholismo',
      description: 'Contra rivales superiores y en eliminatorias: defensa más sólida (+5 de defensa).',
      when: (c) => c.underdog || c.knockout,
      effect: { def: 5 },
    },
  ],
  'esp-ath': [
    {
      name: 'Orgullo de Lezama',
      description: 'En LaLiga y Copa del Rey: +5 % de probabilidad de ganar.',
      when: domestic,
      effect: { win: 0.05 },
    },
  ],
  'esp-sev': [
    {
      name: 'Rey de la Europa League',
      description: 'En la Europa League: +15 % de probabilidad de ganar.',
      when: (c) => c.comp === 'uel',
      effect: { win: 0.15 },
    },
  ],
  'ger-mun': [
    {
      name: 'Mia san mia',
      description: 'En la Bundesliga y la DFB-Pokal: +8 % de probabilidad de ganar.',
      when: domestic,
      effect: { win: 0.08 },
    },
  ],
  'ger-dor': [
    {
      name: 'Muro amarillo',
      description: 'En casa: +8 % de probabilidad de ganar.',
      when: (c) => c.home && !c.neutral,
      effect: { win: 0.08 },
    },
  ],
  'eng-liv': [
    {
      name: 'Noches europeas en Anfield',
      description: 'En casa en competición europea: +12 % de probabilidad de ganar.',
      when: (c) => europe(c) && c.home && !c.neutral,
      effect: { win: 0.12 },
    },
  ],
  'eng-mun': [
    {
      name: 'Fergie time',
      description: 'Si no va ganando a partir del 80′, genera un 60 % más de ocasiones.',
      when: () => true,
      effect: { lateRally: 1.6 },
    },
  ],
  'eng-mci': [
    {
      name: 'Máquina de ganar ligas',
      description: 'En la Premier League: +6 % de probabilidad de ganar.',
      when: (c) => c.comp === 'league',
      effect: { win: 0.06 },
    },
  ],
  'eng-ars': [
    {
      name: 'Reyes del balón parado',
      description: 'Remates de cabeza un 30 % más certeros.',
      when: () => true,
      effect: { header: 1.3 },
    },
  ],
  'eng-che': [
    {
      name: 'Especialistas en finales europeas',
      description: 'En finales europeas: +12 % de probabilidad de ganar.',
      when: (c) => europe(c) && c.final,
      effect: { win: 0.12 },
    },
  ],
  'ita-int': [
    {
      name: 'Catenaccio',
      description: 'En eliminatorias: +4 de defensa.',
      when: (c) => c.knockout,
      effect: { def: 4 },
    },
  ],
  'ita-mil': [
    {
      name: 'Siete Copas de Europa',
      description: 'En la Champions League: +8 % de probabilidad de ganar.',
      when: (c) => c.comp === 'ucl',
      effect: { win: 0.08 },
    },
  ],
  'ita-juv': [
    {
      name: 'Fino alla fine',
      description: 'Si no va ganando a partir del 80′, genera un 40 % más de ocasiones.',
      when: () => true,
      effect: { lateRally: 1.4 },
    },
  ],
  'ita-nap': [
    {
      name: 'Estadio Maradona',
      description: 'En casa: +5 % de probabilidad de ganar.',
      when: (c) => c.home && !c.neutral,
      effect: { win: 0.05 },
    },
  ],
  'fra-psg': [
    {
      name: 'Dominio en Francia',
      description: 'En la Ligue 1 y la Coupe de France: +6 % de probabilidad de ganar.',
      when: domestic,
      effect: { win: 0.06 },
    },
  ],
  'fra-om': [
    {
      name: 'Vélodrome',
      description: 'En casa: +5 % de probabilidad de ganar.',
      when: (c) => c.home && !c.neutral,
      effect: { win: 0.05 },
    },
  ],
  'por-por': [
    {
      name: 'Dragão europeo',
      description: 'En casa en competición europea: +8 % de probabilidad de ganar.',
      when: (c) => europe(c) && c.home && !c.neutral,
      effect: { win: 0.08 },
    },
  ],
  'por-ben': [
    {
      name: 'Inferno da Luz',
      description: 'En casa en la Liga Portugal: +5 % de probabilidad de ganar.',
      when: (c) => c.comp === 'league' && c.home,
      effect: { win: 0.05 },
    },
  ],
};

/** Junta los rasgos activos de un equipo en un partido. */
export function boostFor(teamId: string, ctx: TraitContext): TeamBoost | undefined {
  const active = (TRAITS[teamId] ?? []).filter((t) => t.when(ctx));
  if (!active.length) return undefined;
  const b: TeamBoost = { ...NO_BOOST, labels: [] };
  for (const t of active) {
    const e = t.effect;
    if (e.win) {
      b.xg *= 1 + 0.95 * e.win;
      b.oppXg *= 1 - 0.47 * e.win;
    }
    b.ctl += e.ctl ?? 0;
    b.def += e.def ?? 0;
    b.possession *= e.possession ?? 1;
    b.lateRally *= e.lateRally ?? 1;
    b.header *= e.header ?? 1;
    b.counter *= e.counter ?? 1;
    b.labels.push(t.name);
  }
  return b;
}
