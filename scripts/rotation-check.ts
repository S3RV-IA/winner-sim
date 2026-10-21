// Mide cuánto cambia la titularidad según la racha (forma) de los jugadores.
// Uso: npx vite-node scripts/rotation-check.ts
import seed from '../src/data/seed.json';
import { chooseLineup } from '../src/engine/lineup';
import { Rng } from '../src/engine/rng';
import type { Role, SimPlayer } from '../src/engine/types';

const squad = (teamId: string) => seed.players.filter((p) => p.teamId === teamId).map((p) => ({ ...p, role: p.role as Role, form: 0 })) as SimPlayer[];
function startRate(players: SimPlayer[], id: string, n = 4000) {
  const rng = new Rng(42);
  let s = 0;
  for (let i = 0; i < n; i++) if (chooseLineup(players, rng).starters.some((x) => x.player.id === id)) s++;
  return s / n;
}
function scenario(teamId: string, starterName: string, backupName: string) {
  const ps = squad(teamId);
  const st = ps.find((p) => p.name === starterName)!;
  const bk = ps.find((p) => p.name === backupName)!;
  const rate = (fs: number, fb: number) => {
    st.form = fs;
    bk.form = fb;
    return `${Math.round(startRate(ps, st.id) * 100)}% / ${Math.round(startRate(ps, bk.id) * 100)}%`;
  };
  console.log(`${starterName} (${st.ovr}) vs ${backupName} (${bk.ovr}) — titular/suplente:`);
  console.log(`  forma normal: ${rate(0, 0)} · titular en mala racha: ${rate(-0.6, 0)} · ambos (mala/buena): ${rate(-0.6, 0.6)} · extremo: ${rate(-1, 1)}`);
}
scenario('esp-bar', 'Raphinha', 'Anthony Gordon');
scenario('esp-rma', 'Federico Valverde', 'Eduardo Camavinga');
scenario('esp-bar', 'Dani Olmo', 'Fermín López');
scenario('eng-liv', 'Hugo Ekitike', 'Víctor Muñoz');
