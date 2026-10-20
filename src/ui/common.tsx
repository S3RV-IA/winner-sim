import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Match, StandingRow, Team } from '../game/types';
import { Icon, type IconName } from './Icon';
import { useWorld } from './world';

// ---------------------------------------------------------------------------
// Barra superior y pestañas (estilo Winner)
// ---------------------------------------------------------------------------

export function AppBar(props: { title: string; subtitle?: string; back?: boolean; left?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="appbar">
      <div className="appbar-row">
        <div>
          {props.back ? (
            <button className="icon-btn" onClick={() => nav(-1)} aria-label="Atrás">
              <Icon name="back" />
            </button>
          ) : (
            props.left
          )}
        </div>
        <div className="appbar-title">
          <b>{props.title}</b>
          {props.subtitle && <small>{props.subtitle}</small>}
        </div>
        <div className="appbar-actions">{props.actions}</div>
      </div>
      {props.children}
    </header>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: IconName;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          <Icon name={t.icon} size={20} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/** Valor recordado en la URL (?clave=) para que "atrás" y las recargas vuelvan al mismo sitio. */
export function useUrlParam(key: string): [string | null, (v: string) => void] {
  const read = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get(key);
  const [value, setValue] = useState<string | null>(read);
  const change = (v: string) => {
    setValue(v);
    const [path, query] = location.hash.split('?');
    const params = new URLSearchParams(query ?? '');
    params.set(key, v);
    history.replaceState(null, '', `${path}?${params}`);
  };
  return [value, change];
}

export function useTab<T extends string>(defaultTab: T): [T, (t: T) => void] {
  const [tab, setTab] = useUrlParam('tab');
  return [(tab as T) || defaultTab, setTab];
}

// ---------------------------------------------------------------------------
// Escudos, notas y forma
// ---------------------------------------------------------------------------

export function Crest({ team, size = 24 }: { team?: Team; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!team) return <span className="crest-fallback" style={{ width: size, height: size }} />;
  if (!team.crest || failed)
    return (
      <span className="crest-fallback" style={{ width: size, height: size }}>
        {team.code.slice(0, 3)}
      </span>
    );
  return <img className="crest" src={`crests/${team.crest}`} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />;
}

export const ratingColor = (r: number) => (r >= 8 ? '#2563eb' : r >= 7 ? '#16a34a' : r >= 6.5 ? '#84cc16' : r >= 6 ? '#f59e0b' : '#dc2626');

export function Rating({ value }: { value: number }) {
  if (!value) return <span className="rating" style={{ background: 'var(--draw)' }}>–</span>;
  return (
    <span className="rating tnum" style={{ background: ratingColor(value) }}>
      {value.toFixed(1)}
    </span>
  );
}

export function FormDots({ last }: { last: StandingRow['last'] }) {
  const color = { W: 'var(--win)', D: 'var(--draw)', L: 'var(--loss)' };
  const label = { W: 'V', D: 'E', L: 'D' };
  return (
    <span className="form-dots">
      {last.map((r, i) => (
        <span key={i} className="form-dot" style={{ background: color[r] }}>
          {label[r]}
        </span>
      ))}
    </span>
  );
}

/** Flecha de forma: verde si está en racha, roja si está en mala racha. */
export function FormArrow({ form }: { form: number }) {
  if (Math.abs(form) < 0.15) return <span className="muted small" style={{ marginLeft: 4 }}>=</span>;
  return <Icon name={form > 0 ? 'up' : 'down'} size={20} color={form > 0 ? 'var(--win)' : 'var(--loss)'} />;
}

// ---------------------------------------------------------------------------
// Tarjeta de partido
// ---------------------------------------------------------------------------

export function MatchCard({ match, onSimulate, showDate }: { match: Match; onSimulate?: () => void; showDate?: string }) {
  const { teams } = useWorld();
  const nav = useNavigate();
  const home = teams.get(match.homeId);
  const away = teams.get(match.awayId);
  const score = match.status === 'played' ? match.score : undefined;
  const winner = score ? match.winner ?? (score[0] > score[1] ? 0 : score[0] < score[1] ? 1 : null) : null;
  return (
    <div className="match-card" onClick={() => nav(`/m/${match.id}`)} role="button">
      <div className="match-teams">
        {[home, away].map((t, side) => (
          <div key={side} className={`match-team ${winner !== null && winner !== side ? 'loser' : ''}`}>
            <Crest team={t} size={22} />
            <span className="name ellipsis">{t?.short}</span>
            {match.penalties && <span className="pens tnum">({match.penalties[side]})</span>}
            <span className="score tnum">{score ? score[side] : ''}</span>
          </div>
        ))}
      </div>
      <div className="match-side" onClick={(e) => e.stopPropagation()}>
        {score ? (
          <span className="small muted">{match.penalties ? 'pen.' : match.extraTime ? 'prór.' : match.manual ? 'man.' : 'Final'}</span>
        ) : onSimulate ? (
          <button className="icon-btn" onClick={onSimulate} aria-label="Simular partido">
            <Icon name="dice" color="var(--accent-strong)" />
          </button>
        ) : (
          <span className="small muted">{showDate ?? '—'}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hoja inferior, simulación en curso y avisos
// ---------------------------------------------------------------------------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

interface UiApi {
  /**
   * Ejecuta una tarea mostrando progreso. Con `heavy`, la pantalla de fondo se desmonta mientras dura
   * (si no, sus consultas en vivo se recalculan tras cada fecha simulada y todo va mucho más lento).
   */
  run: <T>(label: string, task: (progress: (n: number, total?: number) => void) => Promise<T>, opts?: { heavy?: boolean }) => Promise<T | undefined>;
  toast: (msg: string) => void;
}

const UiCtx = createContext<UiApi | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState<{ label: string; n: number; total?: number; heavy?: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>();

  const toast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);

  const run = useCallback(
    async <T,>(label: string, task: (progress: (n: number, total?: number) => void) => Promise<T>, opts?: { heavy?: boolean }) => {
      const heavy = opts?.heavy;
      setBusy({ label, n: 0, heavy });
      // Dejar que React desmonte la pantalla antes de empezar
      if (heavy) await new Promise((r) => setTimeout(r, 30));
      try {
        return await task((n, total) => setBusy({ label, n, total, heavy }));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  return (
    <UiCtx.Provider value={{ run, toast }}>
      {busy?.heavy ? <div className="screen" /> : children}
      {busy && (
        <div className="busy">
          <div className="box">
            <div className="bold">{busy.label}</div>
            {busy.n > 0 && (
              <div className="small muted tnum" style={{ marginTop: 6 }}>
                {busy.n} partidos{busy.total ? ` de ${busy.total}` : ''}
              </div>
            )}
            <div className="progress">
              <span style={{ width: busy.total ? `${(100 * busy.n) / busy.total}%` : '30%' }} />
            </div>
          </div>
        </div>
      )}
      {msg && <div className="toast">{msg}</div>}
    </UiCtx.Provider>
  );
}

export function useUi(): UiApi {
  return useContext(UiCtx)!;
}

export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <b className="tnum">{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** Desplaza al principio al cambiar de pantalla. */
export function useScrollTop(dep: unknown) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [dep]);
}
