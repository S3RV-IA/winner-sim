import { chooseLineup, fitFor, type Lineup } from './lineup';
import { Rng } from './rng';
import { effective, expectedGoals, outcomeOdds, possessionShare } from './strength';
import { NO_BOOST } from './types';
import type {
  MatchEvent, MatchOptions, MatchResult, PenaltyKick, PlayerLine, Role, ShotKind, ShotOutcome, Side, SimPlayer, SimSettings, SimTeam, TeamLine,
} from './types';

// ---------------------------------------------------------------------------
// Parámetros del modelo (calibrados con scripts/calibrate.ts)
// ---------------------------------------------------------------------------

/** xG medio por tiro de cada tipo antes de ajustar por la calidad de las ocasiones del equipo. */
const KIND_XG: Record<ShotKind, number> = { pen: 0.78, big: 0.4, head: 0.09, box: 0.095, out: 0.035 };
/** Reparto de los tiros que no son penalti. */
const KIND_SHARE: [ShotKind, number][] = [['big', 0.12], ['head', 0.15], ['out', 0.32], ['box', 0.41]];
const MEAN_KIND_XG = KIND_SHARE.reduce((s, [k, w]) => s + KIND_XG[k] * w, 0);
const PENALTY_PER_SHOT = 0.011;
const BASE_SHOT_XG = 0.105;

/** Quién tira según el tipo de ocasión y el puesto. */
const SHOT_ROLE: Record<'box' | 'head' | 'out', Record<Role, number>> = {
  box: { GK: 0, CB: 0.07, LB: 0.14, RB: 0.14, DM: 0.12, CM: 0.25, AM: 0.55, LW: 0.65, RW: 0.65, ST: 1 },
  head: { GK: 0, CB: 0.45, LB: 0.1, RB: 0.1, DM: 0.2, CM: 0.25, AM: 0.3, LW: 0.3, RW: 0.3, ST: 1 },
  out: { GK: 0, CB: 0.12, LB: 0.25, RB: 0.25, DM: 0.35, CM: 0.75, AM: 0.9, LW: 0.75, RW: 0.75, ST: 0.55 },
};
const ASSIST_ROLE: Record<Role, number> = { GK: 0.02, CB: 0.12, LB: 0.55, RB: 0.55, DM: 0.35, CM: 0.75, AM: 1, LW: 1, RW: 1, ST: 0.5 };
const ASSIST_PROB: Record<ShotKind, number> = { pen: 0, big: 0.8, head: 0.9, box: 0.78, out: 0.45 };
const CARD_ROLE: Record<Role, number> = { GK: 0.15, CB: 1.3, LB: 1.2, RB: 1.2, DM: 1.5, CM: 1.1, AM: 0.8, LW: 0.7, RW: 0.7, ST: 0.8 };
const PASS_ROLE: Record<Role, number> = { GK: 0.05, CB: 0.13, LB: 0.1, RB: 0.1, DM: 0.13, CM: 0.12, AM: 0.09, LW: 0.07, RW: 0.07, ST: 0.05 };
const PASS_ACC: Record<Role, number> = { GK: 0.72, CB: 0.89, LB: 0.82, RB: 0.82, DM: 0.88, CM: 0.87, AM: 0.82, LW: 0.78, RW: 0.78, ST: 0.73 };
const DRIBBLE_ROLE: Record<Role, number> = { GK: 0.02, CB: 0.3, LB: 0.9, RB: 0.9, DM: 0.6, CM: 1.1, AM: 2.2, LW: 3.2, RW: 3.2, ST: 1.6 };
const BLOCK_ROLE: Record<Role, number> = { GK: 0, CB: 1, LB: 0.6, RB: 0.6, DM: 0.6, CM: 0.3, AM: 0.1, LW: 0.1, RW: 0.1, ST: 0.05 };
const DEF_ROLE: Record<Role, number> = { GK: 0.3, CB: 4.5, LB: 3.8, RB: 3.8, DM: 4.5, CM: 3, AM: 1.4, LW: 1.2, RW: 1.2, ST: 0.8 };
/** Nota de partida antes de sumar y restar acciones (calibrada con scripts/rating-season.ts). */
const RATING_BASE = 5.75;
/** Peso de cada acción en la nota del partido. */
const R = {
  firstGoal: 2.0,
  nextGoal: 1.4,
  /** Un gol de penalti vale algo menos que uno en juego. */
  penFactor: 0.75,
  assist: 1.1,
  keyPass: 0.28,
  shot: 0.06,
  shotOn: 0.2,
  dribble: 0.14,
  passOk: 0.006,
  passAcc: 2,
  defAction: 0.15,
  quality: 0.03,
  /** Por encima de esta nota cada punto «bruto» sube menos: el 10 tiene que ser excepcional. */
  softCap: 8.2,
  softFactor: 0.55,
};
const ATTACKING: ReadonlySet<Role> = new Set(['ST', 'LW', 'RW', 'AM']);
const DEFENSIVE: ReadonlySet<Role> = new Set(['CB', 'LB', 'RB']);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Estado interno
// ---------------------------------------------------------------------------

interface Tick {
  idx: number;
  min: number;
  plus?: number;
  /** Fase: 0 primera parte, 1 segunda, 2 prórroga */
  phase: 0 | 1 | 2;
}

interface Appearance {
  p: SimPlayer;
  side: Side;
  role: Role;
  starter: boolean;
  on: number; // índice de tick en que entra
  off: number | null; // índice de tick en que sale (null = acaba en el campo)
  yellow: number;
  red: boolean;
  /** Rendimiento aproximado durante el partido (para decidir cambios). */
  perf: number;
}

interface Shot {
  /** Ocasión nacida de un contraataque. */
  counter?: boolean;
  tick: Tick;
  side: Side;
  shooter: Appearance;
  kind: ShotKind;
  xg: number;
  outcome: ShotOutcome;
  assist?: Appearance;
  keyPasser?: Appearance;
  keeper?: Appearance;
}

interface OtherEvent {
  tick: Tick;
  ev: MatchEvent;
}

function buildTicks(rng: Rng, extraTime: boolean, startIdx = 0): Tick[] {
  const ticks: Tick[] = [];
  let idx = startIdx;
  const half = (from: number, to: number, plusMax: number, phase: 0 | 1 | 2) => {
    for (let m = from; m <= to; m++) ticks.push({ idx: idx++, min: m, phase });
    for (let p = 1; p <= plusMax; p++) ticks.push({ idx: idx++, min: to, plus: p, phase });
  };
  if (!extraTime) {
    half(1, 45, rng.int(1, 4), 0);
    half(46, 90, rng.int(2, 7), 1);
  } else {
    half(91, 105, rng.int(0, 2), 2);
    half(106, 120, rng.int(1, 3), 2);
  }
  return ticks;
}

class TeamState {
  apps: Appearance[] = [];
  bench: SimPlayer[];
  subsLeft = 5;
  subPlan: number[] = [];
  reds = 0;

  constructor(public side: Side, public team: SimTeam, lineup: Lineup) {
    for (const s of lineup.starters)
      this.apps.push({ p: s.player, side, role: s.role, starter: true, on: 0, off: null, yellow: 0, red: false, perf: 0 });
    this.bench = [...lineup.bench];
  }

  onPitch(): Appearance[] {
    return this.apps.filter((a) => a.off === null);
  }

  at(tickIdx: number): Appearance[] {
    return this.apps.filter((a) => a.on <= tickIdx && (a.off === null || a.off > tickIdx));
  }

  keeper(): Appearance | undefined {
    return this.onPitch().find((a) => a.role === 'GK');
  }
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

export function simulateMatch(home: SimTeam, away: SimTeam, settings: SimSettings, opts: MatchOptions, seed: number): MatchResult {
  const rng = new Rng(seed);
  const teams: [SimTeam, SimTeam] = [home, away];
  const boosts = [home.boost ?? NO_BOOST, away.boost ?? NO_BOOST] as const;
  const eff = teams.map((t, s) => {
    const e = effective(t, settings);
    return { att: e.att, ctl: e.ctl + boosts[s].ctl, def: e.def + boosts[s].def };
  }) as [ReturnType<typeof effective>, ReturnType<typeof effective>];
  const neutral = !!opts.neutral;
  const base = expectedGoals(eff[0], eff[1], settings, neutral);
  // Rasgos históricos: multiplican los goles esperados propios y reducen los del rival
  const xg0: [number, number] = [base[0] * boosts[0].xg * boosts[1].oppXg, base[1] * boosts[1].xg * boosts[0].oppXg];
  const odds = outcomeOdds(xg0);

  // Factor del día: Gamma de media 1 y desviación `randomness`
  const k = 1 / Math.max(0.0001, settings.randomness) ** 2;
  const day = [rng.gamma(k) / k, rng.gamma(k) / k];
  const xgTarget = [xg0[0] * day[0], xg0[1] * day[1]];
  const quality = [0, 1].map((s) => BASE_SHOT_XG * Math.exp((0.035 * (eff[s].att - eff[1 - s].def)) / 10));
  const shotRate = [0, 1].map((s) => xgTarget[s] / quality[s] / (1 + PENALTY_PER_SHOT * (KIND_XG.pen / quality[s] - 1)));

  const states = [0, 1].map((s) => new TeamState(s as Side, teams[s], chooseLineup(teams[s].players, rng))) as [TeamState, TeamState];
  // Velocidad: los atacantes rápidos contra defensas lentas generan más ocasiones claras (contragolpes, desmarques)
  const pace = (a: Appearance) => a.p.pac ?? 70;
  const avgPace = (st: TeamState, roles: Role[]) => {
    const ps = st.onPitch().filter((a) => roles.includes(a.role));
    return ps.length ? ps.reduce((s, a) => s + pace(a), 0) / ps.length : 70;
  };
  const bigShare = [0, 1].map((s) =>
    clamp(1 + (avgPace(states[s], ['ST', 'LW', 'RW']) - avgPace(states[1 - s], ['CB', 'LB', 'RB'])) * 0.009, 0.8, 1.3),
  );
  // Nivel medio de remate de cada equipo: la habilidad individual reparte los goles, no los multiplica
  const finishRef = states.map((st) => {
    const ps = st.onPitch().filter((a) => a.role !== 'GK');
    const w = ps.map((a) => SHOT_ROLE.box[a.role]);
    const tot = w.reduce((x, y) => x + y, 0) || 1;
    return {
      fin: ps.reduce((s, a, i) => s + a.p.fin * w[i], 0) / tot,
      hea: ps.reduce((s, a, i) => s + a.p.hea * w[i], 0) / tot,
      lng: ps.reduce((s, a, i) => s + a.p.lng * w[i], 0) / tot,
    };
  });

  for (const st of states) {
    const n = [3, 4, 5][rng.weighted([0.25, 0.35, 0.4])];
    const plan: number[] = [];
    if (rng.chance(0.1)) plan.push(46);
    plan.push(rng.int(55, 68));
    while (plan.length < n) plan.push(rng.int(60, 88));
    st.subPlan = plan.sort((a, b) => a - b);
  }

  const shots: Shot[] = [];
  const recentShots: [number[], number[]] = [[], []];
  // Posesión prevista según el control y los rasgos de dominio del balón
  const basePossession = (() => {
    const p = possessionShare(eff[0], eff[1], neutral);
    const pm = [boosts[0].possession, boosts[1].possession];
    const home = (100 * p * pm[0]) / (p * pm[0] + (100 - p) * pm[1]);
    return [home, 100 - home] as const;
  })();
  const others: OtherEvent[] = [];
  const score: [number, number] = [0, 0];

  const pickWeighted = (apps: Appearance[], weight: (a: Appearance) => number) => {
    const i = rng.weighted(apps.map(weight));
    return i < 0 ? undefined : apps[i];
  };

  const chooseShooter = (st: TeamState, kind: ShotKind): Appearance | undefined => {
    const field = st.onPitch().filter((a) => a.role !== 'GK');
    if (!field.length) return undefined;
    if (kind === 'pen') {
      const taker = field.find((a) => a.p.id === st.team.penaltyTaker);
      return taker ?? field.reduce((b, a) => (a.p.fin > b.p.fin ? a : b));
    }
    const key = kind === 'big' ? 'box' : kind;
    const attr = (a: Appearance) => (kind === 'head' ? a.p.hea : kind === 'out' ? a.p.lng : a.p.fin);
    const speed = (a: Appearance) => (kind === 'big' ? (pace(a) / 75) ** 1.5 : 1);
    return pickWeighted(field, (a) => SHOT_ROLE[key][a.role] * (attr(a) / 70) ** 2.5 * speed(a) * (1 + 0.25 * a.p.form));
  };

  const chooseAssist = (st: TeamState, kind: ShotKind, shooter: Appearance) =>
    pickWeighted(st.onPitch().filter((a) => a !== shooter), (a) => {
      const wide = kind === 'head' && (a.role === 'LB' || a.role === 'RB' || a.role === 'LW' || a.role === 'RW') ? 2 : 1;
      return ASSIST_ROLE[a.role] * wide * (a.p.cre / 70) ** 2.5 * (1 + 0.2 * a.p.form);
    });

  const takeShot = (side: Side, tick: Tick, counter = false) => {
    const st = states[side];
    const opp = states[1 - side];
    recentShots[side].push(tick.idx);
    // Al contraataque las ocasiones salen más claras (mano a mano, superioridad) y nunca son de cabeza ni penalti
    const bigW = bigShare[side] * (counter ? 2.5 : 1);
    const kind: ShotKind =
      !counter && rng.chance(PENALTY_PER_SHOT)
        ? 'pen'
        : KIND_SHARE[rng.weighted(KIND_SHARE.map(([k, w]) => (k === 'big' ? w * bigW : counter && k === 'head' ? 0 : w)))][0];
    const shooter = chooseShooter(st, kind);
    if (!shooter) return;
    const keeper = opp.keeper();
    const gk = keeper?.p.gk ?? 25;
    let p: number;
    let xg: number;
    if (kind === 'pen') {
      xg = KIND_XG.pen;
      p = clamp(0.77 + (shooter.p.fin - 75) * 0.004 - (gk - 78) * 0.003, 0.6, 0.92);
    } else {
      xg = Math.min(0.9, (KIND_XG[kind] * quality[side]) / MEAN_KIND_XG);
      const ref = kind === 'head' ? finishRef[side].hea : kind === 'out' ? finishRef[side].lng : finishRef[side].fin;
      const skill = kind === 'head' ? shooter.p.hea : kind === 'out' ? shooter.p.lng : shooter.p.fin;
      const mult = clamp(1 + (skill - ref) * 0.013, 0.55, 1.45) * (1 + 0.06 * shooter.p.form) * (kind === 'head' ? boosts[side].header : 1);
      const gkMult = clamp(1 - (gk - 78) * 0.008, 0.75, 1.3);
      p = Math.min(0.96, xg * mult * gkMult);
    }
    let outcome: ShotOutcome;
    if (rng.chance(p)) outcome = 'goal';
    else if (kind === 'pen') outcome = rng.chance(0.6) ? 'saved' : rng.chance(0.2) ? 'post' : 'off';
    else {
      const r = rng.next();
      const saved = kind === 'big' ? 0.44 : 0.26;
      const blocked = kind === 'out' ? 0.3 : kind === 'head' ? 0.05 : 0.22;
      outcome = r < saved ? 'saved' : r < saved + 0.03 ? 'post' : r < saved + 0.03 + blocked ? 'blocked' : 'off';
    }
    const shot: Shot = { tick, side, shooter, kind, xg, outcome, keeper, counter };
    if (outcome === 'goal') {
      if (kind !== 'pen' && rng.chance(ASSIST_PROB[kind])) shot.assist = chooseAssist(st, kind, shooter);
      score[side]++;
      shooter.perf += 1;
      if (shot.assist) shot.assist.perf += 0.7;
    } else {
      if (kind !== 'pen' && rng.chance(0.55)) shot.keyPasser = chooseAssist(st, kind, shooter);
      if (kind === 'big' || kind === 'pen') shooter.perf -= 0.4;
      if (outcome === 'saved' && keeper) keeper.perf += 0.3;
    }
    shots.push(shot);
  };

  const sendOff = (st: TeamState, a: Appearance, tick: Tick) => {
    a.red = true;
    a.off = tick.idx;
    st.reds++;
    if (a.role === 'GK') {
      const gk = st.bench.find((p) => p.role === 'GK');
      const out = st.onPitch().filter((x) => x.role !== 'GK').sort((x, y) => x.perf - y.perf)[0];
      if (gk && out && st.subsLeft > 0) {
        st.subsLeft--;
        st.bench = st.bench.filter((p) => p !== gk);
        out.off = tick.idx;
        st.apps.push({ p: gk, side: st.side, role: 'GK', starter: false, on: tick.idx, off: null, yellow: 0, red: false, perf: 0 });
        others.push({ tick, ev: { t: 'sub', min: tick.min, plus: tick.plus, side: st.side, out: out.p.id, in: gk.id } });
      } else if (out) out.role = 'GK';
    }
  };

  const bookings = (side: Side, tick: Tick) => {
    const st = states[side];
    if (rng.chance(1.85 / 96)) {
      const a = pickWeighted(st.onPitch(), (x) => CARD_ROLE[x.role] * (x.yellow ? 0.3 : 1));
      if (!a) return;
      a.yellow++;
      a.perf -= 0.3;
      others.push({ tick, ev: { t: 'card', min: tick.min, plus: tick.plus, side, player: a.p.id, color: 'Y' } });
      if (a.yellow >= 2) {
        others.push({ tick, ev: { t: 'card', min: tick.min, plus: tick.plus, side, player: a.p.id, color: 'R' } });
        sendOff(st, a, tick);
      }
    } else if (rng.chance(0.012 / 96)) {
      const a = pickWeighted(st.onPitch(), (x) => CARD_ROLE[x.role]);
      if (!a) return;
      others.push({ tick, ev: { t: 'card', min: tick.min, plus: tick.plus, side, player: a.p.id, color: 'R' } });
      sendOff(st, a, tick);
    }
  };

  const substitutions = (side: Side, tick: Tick) => {
    const st = states[side];
    while (st.subPlan.length && st.subPlan[0] === tick.min && !tick.plus && st.subsLeft > 0) {
      st.subPlan.shift();
      const losing = score[side] < score[1 - side];
      const out = pickWeighted(
        st.onPitch().filter((a) => a.role !== 'GK' && !(a.on > 0 && a.on >= tick.idx - 25)),
        // Más papeletas de ser cambiado: atacantes, quien está jugando mal, amonestados y quien llega en mala racha
        (a) => 1 + (ATTACKING.has(a.role) ? 0.5 : 0) + (a.perf < 0 ? 0.8 : 0) + (a.yellow ? 0.6 : 0) + (a.perf > 1 ? -0.5 : 0) + Math.max(0, -a.p.form) * 1.2,
      );
      if (!out) continue;
      const options = st.bench.filter((p) => p.role !== 'GK');
      if (!options.length) continue;
      const pick = options
        .map((p) => ({ p, v: fitFor(out.role, p) * (p.ovr + p.form * 6) + (losing && ATTACKING.has(p.role) ? 3 : 0) + rng.normal(0, 2) }))
        .sort((x, y) => y.v - x.v)[0].p;
      st.bench = st.bench.filter((p) => p !== pick);
      st.subsLeft--;
      out.off = tick.idx;
      st.apps.push({ p: pick, side, role: out.role, starter: false, on: tick.idx, off: null, yellow: 0, red: false, perf: 0 });
      others.push({ tick, ev: { t: 'sub', min: tick.min, plus: tick.plus, side, out: out.p.id, in: pick.id } });
    }
  };

  /** Ritmo de ocasiones según el marcador, el minuto y las expulsiones. */
  const stateMult = (side: Side, tick: Tick) => {
    const diff = score[side] - score[1 - side];
    const late = tick.min > 70;
    let m = 1;
    if (diff >= 4) m = 0.5;
    else if (diff === 3) m = 0.64;
    else if (diff === 2) m = tick.min > 60 ? 0.85 : 0.92;
    else if (diff === 1 && late) m = 0.9;
    else if (diff === -1 && tick.min > 60) m = 1.2;
    else if (diff <= -2) m = 1.08;
    m *= 0.75 ** states[side].reds * 1.12 ** states[1 - side].reds;
    if (tick.min >= 80 && diff <= 0) m *= boosts[side].lateRally;
    return m;
  };

  /**
   * Contraataque: el equipo con este rasgo que juega con poca posesión o está encajando más tiros
   * en los últimos 15 minutos puede generar ocasiones extra al contragolpe, más claras de lo normal.
   */
  const countering = (side: Side, tick: Tick) => {
    if (boosts[side].counter <= 1) return false;
    const recent = (s: Side) => recentShots[s].filter((i) => i > tick.idx - 15).length;
    return basePossession[side] < 46 || recent((1 - side) as Side) - recent(side) >= 2;
  };

  const playPeriod = (ticks: Tick[], rateMult: number) => {
    const perTick = shotRate.map((r) => (r / 96) * rateMult);
    for (const tick of ticks) {
      for (const side of [0, 1] as Side[]) {
        substitutions(side, tick);
        bookings(side, tick);
        const rate = perTick[side] * stateMult(side, tick);
        if (rng.chance(rate)) takeShot(side, tick);
        else if (countering(side, tick) && rng.chance(rate * (boosts[side].counter - 1))) takeShot(side, tick, true);
      }
    }
  };

  const regular = buildTicks(rng, false);
  const ht = regular.find((t) => t.min === 45 && !regular.some((u) => u.min === 45 && (u.plus ?? 0) > (t.plus ?? 0)))!;
  playPeriod(regular, 1);
  let lastTick = regular[regular.length - 1];

  if (opts.forcedScore) forceScore(opts.forcedScore, regular);

  // Prórroga y penaltis
  const aggregate = (): [number, number] => {
    const g = goalsBySide();
    return opts.firstLeg ? [g[0] + opts.firstLeg[0], g[1] + opts.firstLeg[1]] : g;
  };
  let extraTime = false;
  let penalties: MatchResult['penalties'];
  if (opts.knockout && aggregate()[0] === aggregate()[1]) {
    extraTime = true;
    for (const st of states) st.subsLeft = Math.min(st.subsLeft + 1, 6);
    const et = buildTicks(rng, true, lastTick.idx + 1);
    playPeriod(et, 0.8);
    lastTick = et[et.length - 1];
    if (aggregate()[0] === aggregate()[1]) penalties = shootout();
  }

  function goalsBySide(): [number, number] {
    const g: [number, number] = [0, 0];
    for (const s of shots) if (s.outcome === 'goal') g[s.side]++;
    return g;
  }

  /** Ajusta las ocasiones para que el marcador sea el indicado (resultados introducidos a mano). */
  function forceScore(target: [number, number], ticks: Tick[]) {
    for (const side of [0, 1] as Side[]) {
      let mine = shots.filter((s) => s.side === side && s.outcome === 'goal');
      while (mine.length > target[side]) {
        const s = rng.pick(mine);
        s.outcome = s.kind === 'pen' ? 'saved' : rng.chance(0.6) ? 'saved' : 'off';
        s.keyPasser = s.assist;
        s.assist = undefined;
        mine = mine.filter((x) => x !== s);
      }
      let count = mine.length;
      while (count < target[side]) {
        const misses = shots.filter((s) => s.side === side && s.outcome !== 'goal');
        const i = rng.weighted(misses.map((s) => s.xg));
        if (i >= 0) {
          const s = misses[i];
          s.outcome = 'goal';
          if (s.kind !== 'pen' && rng.chance(ASSIST_PROB[s.kind])) s.assist = s.keyPasser ?? chooseAssistAt(side, s.tick, s.shooter);
          s.keyPasser = undefined;
        } else {
          const tick = rng.pick(ticks);
          const field = states[side].at(tick.idx).filter((a) => a.role !== 'GK');
          const shooter = rng.weighted(field.map((a) => SHOT_ROLE.box[a.role] * (a.p.fin / 70) ** 3));
          if (shooter < 0) break;
          const s: Shot = { tick, side, shooter: field[shooter], kind: 'box', xg: 0.2, outcome: 'goal', keeper: states[1 - side].at(tick.idx).find((a) => a.role === 'GK') };
          if (rng.chance(ASSIST_PROB.box)) s.assist = chooseAssistAt(side, tick, s.shooter);
          shots.push(s);
        }
        count++;
      }
    }
    shots.sort((a, b) => a.tick.idx - b.tick.idx);
  }

  function chooseAssistAt(side: Side, tick: Tick, shooter: Appearance) {
    const cands = states[side].at(tick.idx).filter((a) => a !== shooter);
    const i = rng.weighted(cands.map((a) => ASSIST_ROLE[a.role] * (a.p.cre / 70) ** 2.5));
    return i < 0 ? undefined : cands[i];
  }

  function shootout(): NonNullable<MatchResult['penalties']> {
    const order = states.map((st) => {
      const field = st.onPitch();
      const taker = field.find((a) => a.p.id === st.team.penaltyTaker);
      const rest = field.filter((a) => a !== taker).sort((a, b) => b.p.fin + b.p.ovr / 2 - (a.p.fin + a.p.ovr / 2));
      return taker ? [taker, ...rest] : rest;
    });
    const kicks: PenaltyKick[] = [];
    const goals: [number, number] = [0, 0];
    const taken: [number, number] = [0, 0];
    const kick = (side: Side) => {
      const shooter = order[side][taken[side] % order[side].length];
      const gk = states[1 - side].keeper()?.p.gk ?? 30;
      const scored = rng.chance(clamp(0.76 + (shooter.p.fin - 75) * 0.004 - (gk - 78) * 0.004, 0.55, 0.9));
      taken[side]++;
      if (scored) goals[side]++;
      kicks.push({ side, player: shooter.p.id, scored });
    };
    for (let r = 0; r < 5; r++) {
      for (const side of [0, 1] as Side[]) {
        kick(side);
        const left = (s: Side) => 5 - taken[s];
        if (goals[0] + left(0) < goals[1] || goals[1] + left(1) < goals[0]) return { score: goals, kicks };
      }
    }
    while (goals[0] === goals[1]) {
      kick(0);
      kick(1);
    }
    return { score: goals, kicks };
  }

  // -------------------------------------------------------------------------
  // Resultado, estadísticas y notas
  // -------------------------------------------------------------------------

  const final = goalsBySide();
  const endIdx = lastTick.idx + 1;
  const agg = aggregate();
  let winner: Side | null = null;
  if (penalties) winner = penalties.score[0] > penalties.score[1] ? 0 : 1;
  else if (agg[0] !== agg[1]) winner = agg[0] > agg[1] ? 0 : 1;

  const possession = clamp(basePossession[0] + rng.normal(0, 3) - 4 * Math.sign(final[0] - final[1]) * Math.min(2, Math.abs(final[0] - final[1])) / 2, 22, 80);
  const poss: [number, number] = [Math.round(possession), 100 - Math.round(possession)];

  const lines = new Map<Appearance, PlayerLine>();
  for (const st of states)
    for (const a of st.apps) {
      const minutes = Math.max(1, Math.round((((a.off ?? endIdx) - a.on) / endIdx) * (extraTime ? 120 : 90)));
      lines.set(a, {
        id: a.p.id, side: a.side, role: a.role, starter: a.starter, minutes,
        goals: 0, assists: 0, shots: 0, shotsOn: 0, shotsOff: 0, bigMissed: 0, penGoals: 0, penMissed: 0, headGoals: 0, outGoals: 0,
        keyPasses: 0, dribbles: 0, dribblesFailed: 0, passes: 0, passesOk: 0, defActions: 0, blocks: 0, saves: 0, conceded: 0,
        yellow: a.yellow > 0 ? 1 : 0, red: a.red ? 1 : 0, rating: 0,
      });
    }

  const teamLines: [TeamLine, TeamLine] = [0, 1].map((s) => ({
    goals: final[s], xg: 0, possession: poss[s], shots: 0, shotsOn: 0, bigChances: 0, passes: 0, passesOk: 0, dribbles: 0, corners: 0,
    yellow: 0, red: 0, saves: 0,
  })) as [TeamLine, TeamLine];

  const events: { idx: number; ev: MatchEvent }[] = [];
  const running: [number, number] = [0, 0];
  /** Extra de nota por evitar ocasiones claras (paradas o bloqueos de ocasiones manifiestas). */
  const bigStops = new Map<Appearance, number>();
  const addStop = (a: Appearance, v: number) => bigStops.set(a, (bigStops.get(a) ?? 0) + v);
  for (const s of shots) {
    const l = lines.get(s.shooter)!;
    const tl = teamLines[s.side];
    l.shots++;
    tl.shots++;
    tl.xg += s.xg;
    if (s.kind === 'big' || s.kind === 'pen') tl.bigChances++;
    if (s.outcome === 'goal' || s.outcome === 'saved') {
      l.shotsOn++;
      tl.shotsOn++;
    } else l.shotsOff++;
    if (s.outcome === 'saved' && s.keeper) {
      lines.get(s.keeper)!.saves++;
      teamLines[1 - s.side].saves++;
      if (s.kind === 'big' || s.kind === 'pen') addStop(s.keeper, s.kind === 'pen' ? 0.6 : 0.3);
    }
    let blocker: Appearance | undefined;
    if (s.outcome === 'blocked') {
      const cands = states[1 - s.side].at(s.tick.idx);
      const i = rng.weighted(cands.map((a) => BLOCK_ROLE[a.role] * (a.p.def / 70)));
      if (i >= 0) {
        blocker = cands[i];
        lines.get(blocker)!.blocks++;
        if (s.kind === 'big') addStop(blocker, 0.3);
      }
    }
    const xg = Math.round(s.xg * 100) / 100;
    if (s.outcome === 'goal') {
      running[s.side]++;
      l.goals++;
      if (s.kind === 'pen') l.penGoals++;
      if (s.kind === 'head') l.headGoals++;
      if (s.kind === 'out') l.outGoals++;
      if (s.assist) {
        const al = lines.get(s.assist)!;
        al.assists++;
        al.keyPasses++;
      }
      for (const a of states[1 - s.side].at(s.tick.idx)) lines.get(a)!.conceded++;
      events.push({ idx: s.tick.idx, ev: { t: 'goal', min: s.tick.min, plus: s.tick.plus, side: s.side, player: s.shooter.p.id, assist: s.assist?.p.id, kind: s.kind, score: [running[0], running[1]], xg, keeper: s.keeper?.p.id, counter: s.counter || undefined } });
    } else {
      if (s.kind === 'big') l.bigMissed++;
      if (s.kind === 'pen') l.penMissed++;
      if (s.keyPasser) lines.get(s.keyPasser)!.keyPasses++;
      events.push({ idx: s.tick.idx, ev: { t: 'miss', min: s.tick.min, plus: s.tick.plus, side: s.side, player: s.shooter.p.id, kind: s.kind, outcome: s.outcome as Exclude<ShotOutcome, 'goal'>, keeper: s.keeper?.p.id, xg, blocker: blocker?.p.id, counter: s.counter || undefined } });
    }
  }
  for (const o of others) {
    events.push({ idx: o.tick.idx, ev: o.ev });
    if (o.ev.t === 'card') teamLines[o.ev.side][o.ev.color === 'Y' ? 'yellow' : 'red']++;
  }
  events.push({ idx: ht.idx + 0.5, ev: { t: 'phase', min: 45, plus: ht.plus, label: 'HT' } });
  const ftTick = regular[regular.length - 1];
  events.push({ idx: ftTick.idx + 0.5, ev: { t: 'phase', min: 90, plus: ftTick.plus, label: 'FT' } });
  if (extraTime) events.push({ idx: lastTick.idx + 0.5, ev: { t: 'phase', min: 120, plus: lastTick.plus, label: 'AET' } });
  if (penalties) events.push({ idx: lastTick.idx + 0.6, ev: { t: 'phase', min: 120, plus: lastTick.plus, label: 'PENS' } });
  events.sort((a, b) => a.idx - b.idx);

  // Pases, regates y acciones defensivas
  for (const side of [0, 1] as Side[]) {
    const st = states[side];
    const oppDef = eff[1 - side].def;
    const teamPasses = poss[side] * 9.6 * (extraTime ? 1.3 : 1);
    const apps = st.apps;
    const w = apps.map((a) => PASS_ROLE[a.role] * (lines.get(a)!.minutes / 90) * Math.sqrt(a.p.pas / 70));
    const tot = w.reduce((x, y) => x + y, 0) || 1;
    apps.forEach((a, i) => {
      const l = lines.get(a)!;
      const n = Math.max(0, Math.round(rng.normal((teamPasses * w[i]) / tot, 3)));
      const acc = clamp(PASS_ACC[a.role] + (a.p.pas - 70) * 0.0035 + (poss[side] - 50) * 0.002 - (oppDef - 73) * 0.0015, 0.45, 0.97);
      l.passes = n;
      l.passesOk = clamp(Math.round(rng.normal(n * acc, Math.sqrt(n * acc * (1 - acc)))), 0, n);
      const attempts = rng.poisson((l.minutes / 90) * DRIBBLE_ROLE[a.role] * (a.p.dri / 70) ** 2);
      const ok = clamp(0.25 + (a.p.dri - 50) * 0.009 + ((a.p.pac ?? 70) - 70) * 0.003 - (oppDef - 70) * 0.004, 0.2, 0.88);
      let won = 0;
      for (let d = 0; d < attempts; d++) if (rng.chance(ok)) won++;
      l.dribbles = won;
      l.dribblesFailed = attempts - won;
      l.defActions = rng.poisson((l.minutes / 90) * DEF_ROLE[a.role] * (a.p.def / 70) ** 1.5 * (1 + (50 - poss[side]) / 100));
      const tl = teamLines[side];
      tl.passes += l.passes;
      tl.passesOk += l.passesOk;
      tl.dribbles += won;
    });
    teamLines[side].corners = rng.poisson(teamLines[side].shots * 0.42);
    teamLines[side].xg = Math.round(teamLines[side].xg * 100) / 100;
  }

  // Notas
  for (const [a, l] of lines) {
    if (l.minutes < 10 && !l.goals && !l.assists && !l.red) {
      l.rating = 0;
      continue;
    }
    const cleanSheet = l.conceded === 0 && l.minutes >= 60;
    const res = winner === null ? (final[a.side] > final[1 - a.side] ? 1 : final[a.side] < final[1 - a.side] ? -1 : 0) : winner === a.side ? 1 : -1;
    const defender = DEFENSIVE.has(a.role);
    let r = RATING_BASE;
    // Goles: el primero es lo que más sube la nota; cada gol más sigue sumando (doblete ≈ 10)
    const openPlay = l.goals - l.penGoals;
    const goalPoints = (n: number) => (n > 0 ? R.firstGoal + (n - 1) * R.nextGoal : 0);
    r += goalPoints(openPlay) + l.penGoals * (openPlay > 0 ? R.nextGoal : R.firstGoal) * R.penFactor + (l.headGoals + l.outGoals) * 0.1;
    r += l.assists * R.assist + (l.keyPasses - l.assists) * R.keyPass;
    r += l.shots * R.shot + (l.shotsOn - l.goals) * R.shotOn - l.shotsOff * 0.02 - l.bigMissed * 0.2 - l.penMissed * 0.6;
    r += l.dribbles * R.dribble - l.dribblesFailed * 0.05;
    // Calidad del jugador: lo que no se ve en las estadísticas (aguantar, presionar, desmarques)
    r += (a.p.ovr - 78) * R.quality;
    // La precisión se compara con lo normal en su puesto (un delantero no da los mismos pases seguros que un central)
    if (l.passes >= 10) r += l.passesOk * R.passOk + (l.passesOk / l.passes - PASS_ACC[a.role]) * R.passAcc;
    // Defender bien (cortes, bloqueos, ocasiones claras evitadas) puede salvar la nota aunque se encajen goles
    r += l.defActions * (defender || a.role === 'DM' ? R.defAction : R.defAction * 0.7) + l.blocks * 0.3 + (bigStops.get(a) ?? 0);
    // Porteros y defensas apenas tienen goles, regates o pases clave: parten algo más arriba
    if (a.role === 'GK') r += 0.6 + l.saves * 0.35 - l.conceded * 0.45 + (cleanSheet ? 0.8 : 0);
    else if (defender) r += 0.35 - l.conceded * 0.5 + (cleanSheet ? 0.5 : 0);
    else if (a.role === 'DM') r += -l.conceded * 0.15 + (cleanSheet ? 0.2 : 0);
    r -= l.yellow * 0.15 + l.red * 1.0;
    r += res === 1 ? 0.3 : res === -1 ? -0.3 : 0;
    r += rng.normal(0, 0.3);
    if (r > R.softCap) r = R.softCap + (r - R.softCap) * R.softFactor;
    l.rating = Math.round(clamp(r, 3, 10) * 10) / 10;
  }

  const players = [...lines.values()];
  const rated = players.filter((p) => p.rating > 0);
  const mvp = rated.reduce((best, p) => (p.rating > best.rating || (p.rating === best.rating && p.side === winner) ? p : best), rated[0]);

  return {
    score: final,
    extraTime,
    penalties,
    winner,
    events: events.map((e) => e.ev),
    teams: teamLines,
    players,
    mvp: mvp?.id ?? '',
    odds,
    expectedGoals: [Math.round(xgTarget[0] * 100) / 100, Math.round(xgTarget[1] * 100) / 100],
    traits: boosts[0].labels.length || boosts[1].labels.length ? [boosts[0].labels, boosts[1].labels] : undefined,
  };
}
