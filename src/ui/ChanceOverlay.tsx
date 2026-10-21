import { useEffect, useRef, useState } from 'react';
import type { MatchEvent, ShotKind } from '../engine/types';
import type { Team } from '../game/types';
import { Crest } from './common';

type ShotEvent = Extract<MatchEvent, { t: 'goal' | 'miss' }>;

/** Ocasiones que paran el reloj: todos los goles y los fallos que pudieron serlo. */
export function isDramatic(e: MatchEvent): e is ShotEvent {
  if (e.t === 'goal') return true;
  if (e.t !== 'miss') return false;
  if (e.kind === 'big' || e.kind === 'pen' || e.outcome === 'post') return true;
  return (e.kind === 'out' || e.kind === 'head') && e.outcome === 'saved';
}

const INTRO: Record<ShotKind, string> = {
  pen: '¡PENALTI!',
  big: '¡OCASIÓN CLARA!',
  out: 'DISPARO DESDE FUERA',
  head: 'REMATE DE CABEZA',
  box: 'DISPARO',
};

const BUILDUP: Record<ShotKind, (n: string) => string> = {
  pen: (n) => `${n} coloca el balón en el punto de penalti…`,
  big: (n) => `${n} se planta solo ante el portero…`,
  out: (n) => `${n} lo intenta desde lejos…`,
  head: (n) => `Centro al área… ¡${n} remata!`,
  box: (n) => `${n} dispara…`,
};

// Escena SVG de 300×170: postes en x=90 y x=210, larguero en y=40, línea de gol en y=108
const GOAL = { left: 90, right: 210, top: 40, bottom: 108 };

interface Plan {
  start: [number, number];
  end: [number, number];
  /** Rebote final (paradas, palos y bloqueos). */
  bounce?: [number, number];
  keeperX: number;
  verdict: string;
  tone: 'goal' | 'save' | 'miss';
}

/** Dónde acaba el balón y hacia dónde se lanza el portero según el desenlace (determinista por minuto). */
function planFor(e: ShotEvent): Plan {
  const leftSide = (e.min + (e.plus ?? 0)) % 2 === 0;
  const high = e.min % 3 === 0;
  const start: [number, number] =
    e.kind === 'pen' ? [150, 158] : e.kind === 'head' ? [leftSide ? 120 : 180, 128] : e.kind === 'out' ? [leftSide ? 80 : 220, 165] : [leftSide ? 125 : 175, 150];
  const corner = leftSide ? GOAL.left + 14 : GOAL.right - 14;
  if (e.t === 'goal')
    return { start, end: [corner, high ? 52 : 96], keeperX: 150 + (leftSide ? 22 : -22) * (e.kind === 'pen' ? -1 : 0.6), verdict: '¡GOOOOL!', tone: 'goal' };
  switch (e.outcome) {
    case 'saved': {
      const x = leftSide ? 118 : 182;
      return { start, end: [x, 74], bounce: [leftSide ? 60 : 240, 95], keeperX: x, verdict: e.kind === 'pen' ? '¡PENALTI PARADO!' : '¡PARADÓN!', tone: 'save' };
    }
    case 'post': {
      const x = leftSide ? GOAL.left : GOAL.right;
      return { start, end: [x, 70], bounce: [leftSide ? 125 : 175, 150], keeperX: 150 + (leftSide ? -12 : 12), verdict: '¡AL PALO!', tone: 'miss' };
    }
    case 'blocked':
      return { start, end: [150 + (leftSide ? -10 : 10), 128], bounce: [leftSide ? 40 : 260, 150], keeperX: 150, verdict: '¡BLOQUEADO!', tone: 'save' };
    default:
      return high
        ? { start, end: [150 + (leftSide ? -30 : 30), 18], keeperX: 150 + (leftSide ? -10 : 10), verdict: '¡FUERA!', tone: 'miss' }
        : { start, end: [leftSide ? 62 : 238, 92], keeperX: 150 + (leftSide ? -18 : 18), verdict: '¡FUERA POR POCO!', tone: 'miss' };
  }
}

interface Props {
  event: ShotEvent;
  team: Team;
  shooter: string;
  keeper?: string;
  /** Multiplicador de velocidad del directo (1, 2 o 4). */
  speed: number;
  onDone: () => void;
  /** Textos propios (p. ej. en la tanda de penaltis). */
  title?: string;
  subtitle?: string;
}

export function ChanceOverlay({ event, team, shooter, keeper, speed, onDone, title, subtitle }: Props) {
  const ball = useRef<SVGGElement>(null);
  const gk = useRef<SVGGElement>(null);
  const net = useRef<SVGGElement>(null);
  const [phase, setPhase] = useState<'intro' | 'shot' | 'verdict'>('intro');
  const plan = planFor(event);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const k = speed >= 4 ? 0.45 : speed >= 2 ? 0.7 : 1;
    // La animación de la ocasión es la función en sí (y se puede apagar con el botón «Ocasiones»),
    // así que no depende de «reducir movimiento»; los adornos (temblor, confeti) sí lo respetan por CSS.
    const intro = (event.kind === 'pen' ? 1100 : 750) * k;
    const flight = (event.kind === 'out' ? 1000 : 800) * k;
    const hold = (event.t === 'goal' ? 1700 : 1300) * k;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    at(intro, () => {
      setPhase('shot');
      const [sx, sy] = plan.start;
      const [ex, ey] = plan.end;
      const midY = Math.min(sy, ey) - (event.kind === 'out' ? 45 : 25);
      const frames: Keyframe[] = [
        { transform: `translate(${sx}px, ${sy}px) scale(1)` },
        { transform: `translate(${(sx + ex) / 2}px, ${midY}px) scale(0.85)`, offset: 0.5 },
        { transform: `translate(${ex}px, ${ey}px) scale(0.62)` },
      ];
      if (plan.bounce) frames.push({ transform: `translate(${plan.bounce[0]}px, ${plan.bounce[1]}px) scale(0.75)` });
      ball.current?.animate(frames, { duration: flight * (plan.bounce ? 1.35 : 1), easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' });
      const dive = plan.keeperX - 150;
      gk.current?.animate(
        [
          { transform: 'translate(150px, 74px) rotate(0deg)' },
          { transform: `translate(${150 + dive * 0.2}px, 74px) rotate(0deg)`, offset: 0.35 },
          { transform: `translate(${plan.keeperX}px, ${dive ? 80 : 74}px) rotate(${Math.sign(dive) * Math.min(70, Math.abs(dive) * 2.2)}deg)` },
        ],
        { duration: flight, easing: 'ease-out', fill: 'forwards' },
      );
    });
    at(intro + flight, () => {
      setPhase('verdict');
      if (event.t === 'goal')
        net.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04, 1.08)' }, { transform: 'scale(1)' }], { duration: 380, iterations: 2 });
    });
    at(intro + flight + hold, () => done.current());
    return () => timers.forEach(clearTimeout);
    // El plan se deriva del evento, así que basta con depender de él
  }, [event, speed]);

  const verdictColor = plan.tone === 'goal' ? 'var(--accent)' : plan.tone === 'save' ? '#60a5fa' : '#f87171';

  return (
    <div className="chance" onClick={() => done.current()} role="dialog" aria-label="Ocasión de gol">
      <div className={`chance-card ${phase === 'verdict' && plan.tone === 'goal' ? 'chance-goal' : ''}`}>
        <div className="chance-head">
          <Crest team={team} size={26} />
          <div className="grow">
            <div className="chance-kind">{title ?? (event.counter ? '¡CONTRAATAQUE!' : INTRO[event.kind])}</div>
            <div className="small chance-sub">
              {subtitle ?? (
                <>
                  {event.min}
                  {event.plus ? `+${event.plus}` : ''}' · {team.short}
                </>
              )}
            </div>
          </div>
        </div>
        <svg viewBox="0 0 300 170" className="chance-pitch" aria-hidden="true">
          <defs>
            <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1f7a3f" />
              <stop offset="1" stopColor="#2e9a52" />
            </linearGradient>
            <pattern id="netp" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M0 0L8 8M8 0L0 8" stroke="rgba(255,255,255,.35)" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="300" height="170" fill="url(#grass)" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} y={i * 44} width="300" height="22" fill="rgba(255,255,255,.04)" />
          ))}
          <path d="M40 108 H260 M70 108 V140 H230 V108" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" fill="none" />
          <circle cx="150" cy="150" r="1.8" fill="rgba(255,255,255,.7)" />
          <g ref={net} style={{ transformOrigin: '150px 74px', transformBox: 'view-box' }}>
            <rect x={GOAL.left} y={GOAL.top} width={GOAL.right - GOAL.left} height={GOAL.bottom - GOAL.top} fill="url(#netp)" />
          </g>
          <path d={`M${GOAL.left} ${GOAL.bottom} V${GOAL.top} H${GOAL.right} V${GOAL.bottom}`} stroke="#fff" strokeWidth="4" fill="none" strokeLinejoin="round" />
          <g ref={gk} style={{ transform: 'translate(150px, 74px)', transformBox: 'view-box' }}>
            <rect x="-9" y="-12" width="18" height="28" rx="6" fill="#facc15" stroke="#1f1f1f" strokeWidth="1.2" />
            <circle cx="0" cy="-17" r="6" fill="#f2c39b" stroke="#1f1f1f" strokeWidth="1.2" />
            <rect x="-16" y="-10" width="7" height="4" rx="2" fill="#facc15" />
            <rect x="9" y="-10" width="7" height="4" rx="2" fill="#facc15" />
          </g>
          <g ref={ball} style={{ transform: `translate(${plan.start[0]}px, ${plan.start[1]}px)`, transformBox: 'view-box' }}>
            <circle r="7" fill="#fff" stroke="#1f1f1f" strokeWidth="1.2" />
            <path d="M-2.5 -2 L2.5 -2 L3.5 2 L0 4 L-3.5 2 Z" fill="#1f1f1f" />
          </g>
        </svg>
        <div className="chance-text">
          {phase === 'verdict' ? (
            <>
              <div className="chance-verdict" style={{ color: verdictColor }}>
                {plan.verdict}
              </div>
              <div className="small chance-sub">
                {event.t === 'goal' ? shooter : plan.tone === 'save' && keeper && event.t === 'miss' && event.outcome === 'saved' ? `Lo detiene ${keeper}` : shooter}
              </div>
            </>
          ) : (
            <div className="chance-build">{event.counter ? `${team.short} sale a la contra… ¡${shooter} se queda solo!` : BUILDUP[event.kind](shooter)}</div>
          )}
        </div>
        {phase === 'verdict' && plan.tone === 'goal' && (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 60}ms`, background: i % 3 ? 'var(--accent)' : '#fff' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
