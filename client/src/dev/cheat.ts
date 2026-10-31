import { MOB_INFO,PETAL_INFO } from '../schema/petals.js';

/** Development-only cheat panel. main.ts loads this module only when the page
 * is opened with ?cheat=1, so normal players never see or touch it. */
export interface CheatApi {
  coordinates(): { x: number; y: number } | undefined;
  loadout(): readonly number[];
  setPetal(slot: number, type: number): Promise<void>;
  spawnMob(type: number, x: number, y: number): Promise<void>;
  teleport(x: number, y: number): Promise<void>;
}

export function installCheatPanel(api: CheatApi): () => void {
  if (document.getElementById('florr-cheat-panel')) return () => {};
  const panel = document.createElement('div');
  panel.id = 'florr-cheat-panel';
  Object.assign(panel.style, {
    position: 'fixed', left: '8px', top: '8px', zIndex: '9999',
    width: '310px', padding: '8px', background: 'rgba(0,0,0,.82)', color: '#fff',
    font: '12px/1.35 monospace', border: '1px solid #666', borderRadius: '4px',
    pointerEvents: 'auto', userSelect: 'text',
  });
  panel.addEventListener('pointerdown', event => event.stopPropagation());
  panel.addEventListener('pointermove', event => event.stopPropagation());
  panel.addEventListener('wheel', event => event.stopPropagation());

  const title = document.createElement('div');
  title.textContent = 'CHEAT TOOLS (dev only)';
  title.style.cssText = 'font-weight:bold;color:#ffd84d;margin-bottom:6px';
  panel.append(title);

  // Read-only lookup tables keep the numeric ids usable without leaving the
  // page. The two scroll areas share the fixed panel height.
  const tables = document.createElement('div');
  tables.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px';
  const makeTable = (heading: string, rows: readonly string[]): void => {
    const column = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = heading;
    label.style.cssText = 'font-weight:bold;color:#ffd84d;margin-bottom:2px';
    const body = document.createElement('div');
    body.style.cssText = 'max-height:150px;overflow:auto;border:1px solid #555;background:#111;padding:2px 3px;white-space:pre';
    body.textContent = rows.join('\n');
    column.append(label, body); tables.append(column);
  };
  const maxPetalId = Math.max(...Object.keys(PETAL_INFO).map(Number));
  const petalRows = Object.entries(PETAL_INFO)
    .map(([id, info]) => `${id.padStart(2, ' ')}  ${info.name}`).join('\n');
  const mobRows = Object.entries(MOB_INFO)
    .map(([id, info]) => `${id.padStart(2, ' ')}  ${info.name}`).join('\n');
  makeTable('petal id => name', petalRows.split('\n'));
  makeTable('mob id => name', mobRows.split('\n'));
  panel.append(tables);

  const loadout = document.createElement('div');
  loadout.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:6px';
  const inputs: HTMLInputElement[] = [];
  for (let slot = 0; slot < 8; slot++) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;flex-direction:column;gap:2px';
    label.append(`Slot ${slot}`);
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = String(maxPetalId); input.step = '1';
    input.style.cssText = 'width:100%;box-sizing:border-box;background:#222;color:#fff;border:1px solid #555';
    input.dataset.dirty = 'false';
    input.addEventListener('input', () => { input.dataset.dirty = 'true'; });
    label.append(input); loadout.append(label); inputs.push(input);
  }
  panel.append(loadout);

  const applyRow = document.createElement('div');
  applyRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px';
  const apply = document.createElement('button'); apply.textContent = 'Apply petal ids';
  const read = document.createElement('button'); read.textContent = 'Read current';
  applyRow.append(apply, read); panel.append(applyRow);

  const coords = document.createElement('div');
  coords.style.cssText = 'margin-bottom:6px;color:#9fe8ff';
  panel.append(coords);

  const spawnRow = document.createElement('div');
  spawnRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:4px';
  const type = document.createElement('input'); type.type = 'number'; type.value = '1'; type.title = 'mob id';
  const x = document.createElement('input'); x.type = 'number'; x.step = '1'; x.value = '0'; x.title = 'x';
  const y = document.createElement('input'); y.type = 'number'; y.step = '1'; y.value = '0'; y.title = 'y';
  for (const input of [type, x, y]) input.style.cssText = 'width:100%;box-sizing:border-box;background:#222;color:#fff;border:1px solid #555';
  spawnRow.append(type, x, y); panel.append(spawnRow);
  const spawnButtons = document.createElement('div');
  spawnButtons.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
  const usePlayer = document.createElement('button'); usePlayer.textContent = 'Use player pos';
  const spawn = document.createElement('button'); spawn.textContent = 'Spawn mob';
  const teleport = document.createElement('button'); teleport.textContent = 'Teleport';
  teleport.title = 'Move your flower to the x/y above';
  spawnButtons.append(usePlayer, spawn, teleport); panel.append(spawnButtons);

  const status = document.createElement('div');
  status.style.cssText = 'margin-top:6px;color:#c9c9c9;white-space:pre-wrap';
  panel.append(status);
  document.body.append(panel);

  const refresh = (): void => {
    const slots = api.loadout();
    inputs.forEach((input, index) => {
      // A periodic refresh must not erase values the user is still editing.
      // Only untouched fields follow the authoritative loadout.
      if (document.activeElement !== input && input.dataset.dirty !== 'true')
        input.value = String(slots[index] ?? 0);
    });
    const position = api.coordinates();
    // Spawn/teleport coordinates are explicit: only "Use player pos" copies
    // the live position. Periodically overwriting them would make every spawn
    // land on the player and prevent preparing a destination before moving.
    coords.textContent = position
      ? `x ${position.x.toFixed(1)}  y ${position.y.toFixed(1)}`
      : 'No controlled flower';
  };
  refresh();
  const refreshTimer = window.setInterval(refresh, 100);

  read.addEventListener('click', () => {
    for (const input of inputs) input.dataset.dirty = 'false';
    refresh();
  });
  apply.addEventListener('click', () => {
    void (async () => {
      status.textContent = 'Applying…';
      try {
        for (let slot = 0; slot < inputs.length; slot++) {
          const value = Math.max(0, Math.min(maxPetalId, Math.trunc(Number(inputs[slot].value) || 0)));
          if (value !== (api.loadout()[slot] ?? 0)) await api.setPetal(slot, value);
        }
        for (const input of inputs) input.dataset.dirty = 'false';
        refresh();
        status.textContent = 'Applied';
      } catch (error) { status.textContent = String(error); }
    })();
  });
  usePlayer.addEventListener('click', () => {
    const position = api.coordinates();
    if (position) { x.value = String(position.x); y.value = String(position.y); }
  });
  spawn.addEventListener('click', () => {
    void (async () => {
      status.textContent = 'Spawning…';
      try {
        await api.spawnMob(Math.max(1, Math.trunc(Number(type.value) || 1)), Number(x.value) || 0, Number(y.value) || 0);
        status.textContent = `Spawned mob ${type.value}`;
      } catch (error) { status.textContent = String(error); }
    })();
  });
  teleport.addEventListener('click', () => {
    void (async () => {
      const tx = Number(x.value) || 0, ty = Number(y.value) || 0;
      status.textContent = 'Teleporting…';
      try {
        await api.teleport(tx, ty);
        status.textContent = `Teleported to ${tx}, ${ty}`;
      } catch (error) { status.textContent = String(error); }
    })();
  });
  return () => { window.clearInterval(refreshTimer); panel.remove(); };
}
