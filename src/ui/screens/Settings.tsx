import { useRef, useState } from 'react';
import { db } from '../../db/db';
import { exportBackup, importBackup } from '../../game/backup';
import { DEFAULT_CONFIG } from '../../game/defaults';
import { resetGame } from '../../game/init';
import type { Config, LeagueId } from '../../game/types';
import { AppBar, Stepper, useUi } from '../common';
import { Icon } from '../Icon';
import { useWorld } from '../world';
import { FLAGS } from './Home';

export function Settings() {
  const { config, leagues, season } = useWorld();
  const ui = useUi();
  const [draft, setDraft] = useState<Config>(config);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const setZone = (l: LeagueId, k: 'ucl' | 'uel' | 'rel', v: number) => setDraft({ ...draft, zones: { ...draft.zones, [l]: { ...draft.zones[l], [k]: v } } });
  const totalUcl = leagues.reduce((a, l) => a + draft.zones[l.id].ucl, 0);
  const totalUel = leagues.reduce((a, l) => a + draft.zones[l.id].uel, 0) + (draft.cupWinnerToUel ? 6 : 0);

  const save = async () => {
    await db.meta.put({ key: 'config', value: draft });
    ui.toast('Ajustes guardados');
  };

  const download = async () => {
    const blob = await exportBackup();
    const name = `winner-${season.label.replace('/', '-')}-${new Date().toISOString().slice(0, 10)}.json`;
    const f = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [f] })) {
      await navigator.share({ files: [f], title: 'Copia de Winner Sim' }).catch(() => undefined);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  };

  return (
    <div className="screen">
      <AppBar title="Ajustes" back />
      <div className="content">
        <div className="section-title">Plazas por liga</div>
        <div className="card list">
          <div className="row small muted" style={{ minHeight: 36 }}>
            <div className="grow" />
            <span style={{ width: 112, textAlign: 'center', color: 'var(--ucl)' }}>Champions</span>
            <span style={{ width: 112, textAlign: 'center', color: 'var(--uel)' }}>Europa L.</span>
            <span style={{ width: 112, textAlign: 'center', color: 'var(--rel)' }}>Descenso</span>
          </div>
          {leagues.map((l) => (
            <div key={l.id} className="row" style={{ flexWrap: 'wrap' }}>
              <div className="grow bold" style={{ minWidth: 90 }}>
                {FLAGS[l.id]} {l.name}
              </div>
              <Stepper value={draft.zones[l.id].ucl} max={8} onChange={(v) => setZone(l.id, 'ucl', v)} />
              <Stepper value={draft.zones[l.id].uel} max={8} onChange={(v) => setZone(l.id, 'uel', v)} />
              <Stepper value={draft.zones[l.id].rel} max={5} onChange={(v) => setZone(l.id, 'rel', v)} />
            </div>
          ))}
          <label className="row">
            <div className="grow">
              El campeón de copa juega la Europa League
              <div className="small muted">Si ya estaba clasificado, la plaza pasa al siguiente de la liga</div>
            </div>
            <input type="checkbox" checked={draft.cupWinnerToUel} onChange={(e) => setDraft({ ...draft, cupWinnerToUel: e.target.checked })} style={{ width: 22, height: 22, accentColor: 'var(--accent)' }} />
          </label>
        </div>
        <p className="small muted" style={{ margin: '8px 4px' }}>
          Champions: {totalUcl} plazas · Europa League: {totalUel}. Cada competición se juega con 24 equipos (o 32 si hay más clasificados); los huecos se completan con los siguientes
          mejor clasificados. Los colores de la clasificación cambian al momento; las plazas se reparten al empezar la próxima temporada. Los puestos de descenso no bajan de categoría: reciben una penalización de forma para la temporada siguiente.
        </p>

        <div className="section-title">Simulación</div>
        <div className="card" style={{ padding: '6px 14px 14px' }}>
          <Slider
            label="Sorpresas"
            hint="Cuánto puede variar el rendimiento de un equipo en un partido"
            value={draft.sim.randomness}
            min={0.06}
            max={0.32}
            step={0.01}
            show={(v) => (v < 0.13 ? 'Pocas' : v < 0.22 ? 'Normales' : 'Muchas')}
            onChange={(v) => setDraft({ ...draft, sim: { ...draft.sim, randomness: v } })}
          />
          <Slider
            label="Factor campo"
            hint="Ventaja de jugar en casa"
            value={draft.sim.homeAdvantage}
            min={1}
            max={1.3}
            step={0.01}
            show={(v) => `+${Math.round((v - 1) * 100)}% goles`}
            onChange={(v) => setDraft({ ...draft, sim: { ...draft.sim, homeAdvantage: v } })}
          />
          <Slider
            label="Peso de la forma"
            hint="Puntos de nivel que gana o pierde un equipo en racha"
            value={draft.sim.formImpact}
            min={0}
            max={6}
            step={0.5}
            show={(v) => `±${v} puntos`}
            onChange={(v) => setDraft({ ...draft, sim: { ...draft.sim, formImpact: v } })}
          />
          <button className="btn block" style={{ marginTop: 6 }} onClick={() => setDraft({ ...draft, sim: DEFAULT_CONFIG.sim })}>
            Valores recomendados
          </button>
        </div>

        <label className="card row" style={{ marginTop: 12 }}>
          <div className="grow">
            Rasgos históricos de los clubes
            <div className="small muted">Ventajas especiales según la historia de cada club (remontadas del Madrid, posesión del Barça…)</div>
          </div>
          <input
            type="checkbox"
            checked={draft.traits !== false}
            onChange={(e) => setDraft({ ...draft, traits: e.target.checked })}
            style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
          />
        </label>

        <button className="btn primary block" style={{ marginTop: 14 }} disabled={!dirty} onClick={save}>
          Guardar ajustes
        </button>

        <div className="section-title">Copia de seguridad</div>
        <div className="card list">
          <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={download}>
            <Icon name="download" color="var(--accent-strong)" />
            <div className="grow">
              Exportar partida
              <div className="small muted">Guarda un archivo con todas tus temporadas (en Archivos o iCloud)</div>
            </div>
          </button>
          <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => file.current?.click()}>
            <Icon name="upload" color="var(--accent-strong)" />
            <div className="grow">
              Importar partida
              <div className="small muted">Sustituye la partida actual por una copia</div>
            </div>
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !confirm('¿Sustituir la partida actual por esta copia?')) return;
              await ui.run('Importando…', () => importBackup(f));
              location.hash = '#/';
            }}
          />
          <button
            className="row"
            style={{ width: '100%', textAlign: 'left', color: 'var(--rel)' }}
            onClick={async () => {
              if (!confirm('Se borrarán todas las temporadas, títulos y premios. ¿Empezar de cero?')) return;
              await ui.run('Reiniciando…', () => resetGame());
              location.hash = '#/';
            }}
          >
            <Icon name="undo" />
            <div className="grow">Empezar de cero</div>
          </button>
        </div>
        <p className="small muted" style={{ margin: '12px 4px', textAlign: 'center' }}>
          Datos de equipos y plantillas 2026/27: Wikipedia (CC BY-SA). Uso personal.
        </p>
      </div>
    </div>
  );
}

function Slider(props: { label: string; hint: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <b>{props.label}</b>
        <span className="small muted">{props.show(props.value)}</span>
      </div>
      <div className="small muted">{props.hint}</div>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}
