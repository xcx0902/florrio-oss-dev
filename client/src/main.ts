import { ServerWorkerClient } from './net/worker.js';
import { InputPacketEncoder } from './net/input.js';
import { WorldState, type EntityState } from './state/world.js';
import { DeathLifecycle } from './state/death.js';
import { CameraState } from './state/camera.js';
import { interpolateCameraTarget } from './state/interpolation.js';
import { getPointerMovement, updatePanState } from './state/pan.js';
import { PlayerWorldTransformCache } from './state/world-transform.js';
import { loadoutSlots, playerLoadoutSlots, playerSlotProgress } from './state/loadout.js';
import { CompositeSnapshotDecoder, OriginalBareSnapshotDecoder, SkeletonSnapshotDecoder, type DenseGroupPlan, type EntitySnapshot, type SnapshotEvent } from './state/snapshot.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from './state/field-types.js';
import { PointerInput } from './input/pointer.js';
import { KeyboardInput } from './input/keyboard.js';
import { MenuControls } from './input/menu.js';
import { MOB_INFO } from './schema/petals.js';
import { TouchJoystick } from './input/touch.js';
import { wrapContext } from './render/canvas2d/context.js';
import { drawWorld } from './render/world.js';
import { PetalTransfers } from './render/petal-transfers.js';
import { PetalMotionState } from './render/petal-motion.js';
import { menuCloseRect, menuContentRect, menuScrollMax, settingsRowAt } from './render/menu-layout.js';
import { MovementHelper } from './render/movement-helper.js';
import { drawHud, createHudState, getHudLayout, equippedSlotCount, type HudState, hotbarSlotAt, inventorySlotAt } from './render/ui.js';
import { SilentAudioBus } from './audio/audio.js';

const foundCanvas = document.querySelector<HTMLCanvasElement>('#canvas');
if (!foundCanvas) throw new Error('missing #canvas');
const canvas: HTMLCanvasElement = foundCanvas;

const foundContext = canvas.getContext('2d');
if (!foundContext) throw new Error('Canvas2D unavailable');
const context2d: CanvasRenderingContext2D = foundContext;

const world = new WorldState();
const deathLifecycle = new DeathLifecycle();
const camera = new CameraState();
const menuCamera = new CameraState();
const hudState = createHudState();
const playerTransform = new PlayerWorldTransformCache();
const petalTransfers = new PetalTransfers();
const petalMotion = new PetalMotionState();
const movementHelper = new MovementHelper();
const mobileUi = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
// The archived camera starts at scale 1.0 and relaxes to 0.9, which projects
// to 0.666667 -> 0.6 pixels per world unit at 1280 x 720. The 0.600205 value
// in the garden-idle golden is the 30-frame sample of that transition, not a
// constant (later scenes settle on exactly 0.6).
camera.zoom = 2 / 3;
declare global {
  interface Window {
    __florr?: {
      world: WorldState;
      camera: CameraState;
      freeze(): void;
      resume(): void;
      start(): Promise<void>;
      readonly ui: { readonly started: boolean; readonly inventoryOpen: boolean; readonly selectedSlot: number; readonly dead: boolean; readonly status: string; readonly menuPanel: string | undefined; readonly movementDisabled: boolean; readonly name: string;
        readonly keyboardSlot: number | undefined; readonly keyboardHint: number; readonly keyboardHighlightAlpha: number;
        readonly menuScroll: Readonly<Record<string, number>> };
      setSnapshot(entities: readonly EntitySnapshot[], events?: readonly SnapshotEvent[]): void;
      /** Apply a decoded state at an explicit client clock. Used by the visual
       * runner to feed the same two-tick interpolation window as the golden. */
      setSnapshotAt(entities: readonly EntitySnapshot[], at: number): void;
      /** Replay bytes through the production decoder and delta receiver. */
      applyPacketAt(bytes: readonly number[], at: number): boolean;
      /** Pin the camera for a recorded (same-camera) comparison. */
      setCamera(x: number, y: number, zoom?: number, entityOffsetX?: number, entityOffsetY?: number): void;
      /** Pin this frame's drawing after input has sampled the previous view. */
      setRenderCamera(x: number, y: number, zoom?: number, entityOffsetX?: number, entityOffsetY?: number): void;
      getCamera(): { x: number; y: number; zoom: number };
      clearCameraOverride(): void;
      /** Start the artwork clock at an explicit time for repeatable recordings. */
      setAnimationTime(at: number): void;
      /** Test/diagnostic hooks that speak the real opcode 3/4 protocol. */
      suicide(): Promise<void>;
      restart(): Promise<void>;
    };
    __florrStart?: () => Promise<void>;
  }
}
let frozen = false;
let injectedSequence = 0;
let animationOffset = 0;
let pendingRenderCamera: readonly [number, number, number | undefined, number, number] | undefined;
window.__florr = {
  world,
  camera,
  freeze: () => { frozen = true; },
  resume: () => { frozen = false; pendingRenderCamera = undefined; camera.clearOverride(); },
  start: async () => startGame(),
  get ui() { return { started, inventoryOpen, selectedSlot, dead, status, menuPanel: menuControls.panel, movementDisabled,
    name: menuControls.name.value, keyboardSlot, keyboardHint, keyboardHighlightAlpha, menuScroll: menuControls.renderState().scroll }; },
  suicide: async () => { await server.send(inputEncoder.suicide()); },
  restart: async () => { await restartGame(); },
  setCamera: (x, y, zoom, offsetX, offsetY) => { camera.setCamera(x, y, zoom, offsetX, offsetY); },
  setRenderCamera: (x, y, zoom, offsetX = 0, offsetY = 0) => {
    pendingRenderCamera = [x, y, zoom, offsetX, offsetY];
  },
  getCamera: () => camera.getCamera(),
  clearCameraOverride: () => { pendingRenderCamera = undefined; camera.clearOverride(); },
  setAnimationTime: at => { animationOffset = at - performance.now(); },
  setSnapshot: (entities, events = []) => {
    injectedSequence += 1;
    world.reset();
    deathLifecycle.reset();
    camera.reset();
    hudState.reset();
    playerTransform.invalidate();
    petalTransfers.reset();
    enteredWorld = false;
    camera.clearOverride();
    pendingRenderCamera = undefined;
    // An empty reset is not a received server metadata packet. In particular
    // the menu's preview HUD must wait for the first real snapshot.
    if (entities.length || events.length)
      world.apply({ sequence: injectedSequence, serverTime: 0, entities, events }, performance.now());
    enteredWorld = localPlayer() !== null;
  },
  setSnapshotAt: (entities, at) => {
    injectedSequence += 1;
    world.apply({ sequence: injectedSequence, serverTime: at, entities, events: [] }, at);
  },
  applyPacketAt: (bytes, at) => applyPacket(Uint8Array.from(bytes), at),
};
const densePlans: readonly DenseGroupPlan[] = DENSE_GROUPS.map(group => ({
  offset: group.offset,
  specs: DENSE_GROUP_SPECS[group.offset] ?? [],
}));
// The live C++ server writes the original mask/field form. Keep the skeleton
// decoder as a fallback for older packets; index 0 is the original path.
const decoder = new CompositeSnapshotDecoder([
  new OriginalBareSnapshotDecoder(densePlans),
  new SkeletonSnapshotDecoder(),
]);
function applyPacket(packet: Uint8Array, at: number): boolean {
  const snapshot = decoder.decode(packet);
  if (snapshot === null) return false;
  const player = localPlayer();
  if (player) petalTransfers.receive(snapshot.events ?? [], world, camera, at, {
    width: camera.viewportWidth, height: camera.viewportHeight,
    level: player.entity.level ?? 1, mobile: mobileUi, pixelRatio: camera.pixelRatio,
  });
  if (decoder.lastIndex === 1) world.apply(snapshot, at);
  else world.applyPartial(snapshot, at);
  deathLifecycle.observe(world);
  return true;
}
const pointer = new PointerInput(canvas);
canvas.addEventListener('wheel', event => {
  // Original cp6_mouse_wheel: deltaY/175, multiplied by three for the
  // Chrome wheelDeltaY convention, then adjusted for line/page delta modes.
  const legacyWheel = event as WheelEvent & { wheelDeltaY?: number };
  let delta = event.deltaY / 175;
  if (legacyWheel.wheelDeltaY !== undefined ? legacyWheel.wheelDeltaY === -3 * event.deltaY
      : event.deltaMode === 0) delta *= 3;
  if (event.deltaMode === 1) delta /= 18;
  else if (event.deltaMode === 2) delta /= 1000;
  if (!started && menuControls.wheel(delta)) event.preventDefault();
}, { passive: false });
const keyboard = new KeyboardInput();
const touch = new TouchJoystick(canvas);
const audio = new SilentAudioBus();
const server = new ServerWorkerClient();
const inputEncoder = new InputPacketEncoder();
const renderContext = wrapContext(context2d);
const menuControls = new MenuControls();
let last = performance.now();
let running = true;
let started = false;
let serverInitialized = false;
let pendingSpawn: string | undefined;
let pendingRestart = false;
let completedServerTicks = 0;
let nextSpawnTick = 0;
let spawnSentTick: number | undefined;
let enteredWorld = false;
let dead = false;
let deathAt: number | undefined;
let inventoryOpen = false;
let selectedSlot = 0;
let keyboardSlot: number | undefined;
let keyboardSlotAt = 0;
const hotbarTypes = [1, 1, 1, 1, 1];
let dragSlot: number | undefined;
let dragInventorySlot: number | undefined;
let inventoryTypes: number[] = [];
let pointerMovement = { angle: 0, strength: 0 };
let movementDisabled = false;
let hintExpand = 0;
let keyboardHint = 0;

let keyboardHighlightX = 0, keyboardHighlightY = 0, keyboardHighlightSize = 58;
let keyboardHighlightAlpha = 0, keyboardHighlightReady = false;
let deleteAlpha = 0;
let entryAt: number | undefined;
let entryCanvas: HTMLCanvasElement | undefined;
let exitAt: number | undefined;
let exitCanvas: HTMLCanvasElement | undefined;
let exitFrame = 0;
let menuRespawn: { level: number; items: readonly number[] } | undefined;
let lastDeathMetadata = { killerName: '', keptCount: 0, keptItems: [] as readonly number[], score: 0, deathLevel: 0, respawnLevel: 1 };
let lastSlots: number[] = [1, 1, 1, 1, 1];
let lastLevel = 1;
let helperPlayer: { x: number; y: number } | undefined;
let status = 'Connecting…';
let dpr = 1;

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  camera.resize(width, height, dpr);
  menuControls.resize(width, height);
}

function localPlayer(): { entity: EntityState; kind: number } | null {
  const entity = world.playerEntity();
  return entity !== undefined && entity.health > 0 ? { entity, kind: entity.kind ?? entity.typeId } : null;
}

async function startGame(): Promise<void> {
  if (started) return;
  started = true;
  deathLifecycle.reset();
  inventoryOpen = false;
  menuControls.open(undefined); menuControls.show(false);
  pointer.reset(); keyboard.clearPressed();
  hudState.reset();
  petalTransfers.reset();
  movementHelper.reset();
  helperPlayer = undefined;
  entryAt = undefined; entryCanvas = undefined; exitAt = undefined; exitCanvas = undefined;
  exitFrame = 0;
  menuRespawn = undefined; hintExpand = 0;
  keyboardHint = 0; keyboardHighlightReady = false; keyboardHighlightAlpha = 0;
  dragSlot = dragInventorySlot = undefined; petalMotion.reset();
  status = 'Entering the garden…';
  try {
    if (!serverInitialized) { await server.init(); serverInitialized = true; }
    pendingSpawn = menuControls.name.value.trim();
    pendingRestart = false;
  } catch {
    status = 'Server unavailable';
  }
}

/** Diagnostic local restart shares the pending spawn/cooldown path. Opcode4
 * is the engine's compatibility entry point for the original restart request. */
async function restartGame(): Promise<void> {
  started = true;
  menuRespawn = undefined;
  status = 'Respawning…';
  pendingSpawn = menuControls.name.value.trim();
  pendingRestart = true;
}

function continueToMenu(): void {
  // Preserve the final death frame for the closing iris. The menu is rendered
  // underneath it and remains visible outside the shrinking circle.
  if (!exitCanvas) exitCanvas = document.createElement('canvas');
  exitCanvas.width = canvas.width; exitCanvas.height = canvas.height;
  exitCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
  exitAt = performance.now();
  exitFrame = 0;
  // The original menu always carries the respawn line after a death, even
  // when no petal survived ("with:" is part of the native format string).
  menuRespawn = { level: lastDeathMetadata.respawnLevel || lastLevel,
    items: [...lastDeathMetadata.keptItems] };
  started = enteredWorld = dead = false;
  deathAt = undefined; inventoryOpen = movementDisabled = false;
  dragSlot = dragInventorySlot = undefined;
  petalMotion.reset(); hintExpand = 0; keyboardHint = 0;
  keyboardHighlightReady = false; keyboardHighlightAlpha = 0;
  entryAt = undefined; entryCanvas = undefined;
  keyboardSlot = undefined;
  pendingSpawn = undefined;
  pendingRestart = false;
  pointer.reset(); keyboard.clearPressed();
  status = ''; menuControls.show(true);
  menuControls.name.focus({ preventScroll: true });
}

let ticking = false;
// Development speed control: each real 50ms interval still sends one input
// packet, but advances this many fixed 50ms engine ticks.
let serverSpeed = 1;
async function tickServer(): Promise<void> {
  if (frozen || ticking) return;
  ticking = true;
  try {
    const player = localPlayer();
    const enter = keyboard.consumePressed('Enter');
    if (!started && enter) {
      await startGame();
    } else if (started && enteredWorld && player === null && enter) {
      continueToMenu();
    }
    // Original spawn has two gates: the one-second corpse and a 2500ms
    // cooldown measured from the last successful spawn. This manual worker
    // advances exactly 50ms per completed think(), so even a stalled tab sends
    // one request at the engine's deadline. Retain it until a healthy body arrives.
    if (started && pendingSpawn !== undefined && spawnSentTick === undefined
      && completedServerTicks >= nextSpawnTick
      && ![...world.all()].some(entity => entity.kind === 1)) {
      await server.send(pendingRestart ? inputEncoder.restart() : inputEncoder.spawn(pendingSpawn));
      spawnSentTick = completedServerTicks;
    }
    if (started && player !== null) {
      let { angle, strength } = pointerMovement;
      if (movementDisabled || menuControls.keyboardMovement) strength = 0;
      const keyboardX = (keyboard.isDown('KeyD') || keyboard.isDown('ArrowRight') ? 1 : 0)
        - (keyboard.isDown('KeyA') || keyboard.isDown('ArrowLeft') ? 1 : 0);
      const keyboardY = (keyboard.isDown('KeyS') || keyboard.isDown('ArrowDown') ? 1 : 0)
        - (keyboard.isDown('KeyW') || keyboard.isDown('ArrowUp') ? 1 : 0);
      if (keyboardX !== 0 || keyboardY !== 0) {
        angle = Math.atan2(keyboardY, keyboardX);
        strength = 1000;
      }
      if (touch.vector.active) {
        angle = Math.atan2(touch.vector.y, touch.vector.x);
        strength = 200 * Math.min(1, Math.hypot(touch.vector.x, touch.vector.y));
      }
      const uiPointer = movementDisabled || inventoryOpen || hotbarHover() !== undefined;
      const buttons = uiPointer ? 0 : ((pointer.buttons.left || keyboard.isDown('Space') ? 1 : 0)
        | (pointer.buttons.right || keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight') ? 2 : 0));
      await server.send(inputEncoder.input(buttons, angle, strength));
    }
    for (let step = 0; step < serverSpeed; step++) {
      await server.think();
      completedServerTicks += 1;
      await server.requestStream('sp_server_flush', undefined, packet => {
        if (!applyPacket(packet, performance.now())) throw new Error('invalid server snapshot');
      });
    }
    if (started && localPlayer() !== null) {
      if (pendingSpawn !== undefined) {
        nextSpawnTick = (spawnSentTick ?? completedServerTicks) + 50;
        pendingSpawn = undefined;
        pendingRestart = false;
        spawnSentTick = undefined;
      }
      status = '';
      dead = false;
    } else if (started) {
      status = 'Waiting for the garden…';
    }
  } catch {
    status = 'Server error';
  } finally {
    ticking = false;
  }
}


async function ensureServer(): Promise<void> {
  if (!serverInitialized) { await server.init(); serverInitialized = true; }
}
function installDevelopmentCheats(): void {
  if (!new URLSearchParams(location.search).has('cheat')) return;
  void import('./dev/cheat.js').then(({ installCheatPanel }) => installCheatPanel({
    coordinates: () => {
      const player = localPlayer();
      return player ? { x: player.entity.x, y: player.entity.y } : undefined;
    },
    loadout: () => hotbarTypes.slice(0, 8),
    setPetal: async (slot, type) => {
      await ensureServer();
      const bytes = new Uint8Array([slot & 255, type & 255, (type >>> 8) & 255]);
      await server.request('sp_server_debug_set_loadout_slot', bytes);
    },
    spawnMob: async (type, x, y) => {
      await ensureServer();
      const bytes = new Uint8Array(10);
      const view = new DataView(bytes.buffer);
      view.setUint16(0, type, true); view.setFloat32(2, x, true); view.setFloat32(6, y, true);
      await server.request('sp_server_debug_spawn_mob', bytes);
    },
    teleport: async (x, y) => {
      await ensureServer();
      const bytes = new Uint8Array(8);
      const view = new DataView(bytes.buffer);
      view.setFloat32(0, x, true); view.setFloat32(4, y, true);
      await server.request('sp_server_debug_set_player_position', bytes);
    },
    setSpeed: multiplier => {
      serverSpeed = Math.max(1, Math.min(8, Math.trunc(multiplier) || 1));
    },
  }));
}

async function boot(): Promise<void> {
  resize();
  window.addEventListener('resize', resize);
  // The Ubuntu face is declared with @font-face and only starts loading when a
  // draw uses it; force it before the first frame so every recorded frame uses
  // the same metrics (otherwise frame 1 falls back and the trace is flaky).
  try { await document.fonts.load('bold 24px Ubuntu, sans-serif'); } catch { /* keep the fallback */ }
  await document.fonts.ready;
  document.getElementById('status')?.remove();
  menuControls.name.focus({ preventScroll: true });
  window.setInterval(() => { void tickServer(); }, 50);
  installDevelopmentCheats();
  requestAnimationFrame(frame);
}

function handleUiKeys(): void {
  if (!started || dead) {
    if (keyboard.consumePressed('Escape')) menuControls.open(undefined);
    return;
  }
  const now = performance.now();
  if (keyboard.consumePressed('KeyI') || keyboard.consumePressed('Tab')) inventoryOpen = !inventoryOpen;
  if (keyboard.consumePressed('Escape')) { inventoryOpen = false; keyboardSlot = undefined; }
  const equipped = equippedSlotCount(localPlayer()?.entity.level ?? 1);
  if (now - keyboardSlotAt > 5000 || !hotbarTypes[keyboardSlot ?? -1]) keyboardSlot = undefined;
  const reserves = hotbarTypes.slice(equipped, equipped + 8)
    .flatMap((type, index) => type ? [equipped + index] : []);
  const previous = keyboard.consumePressed('KeyQ'), next = keyboard.consumePressed('KeyE');
  if (previous || next) {

    if (reserves.length) {
      const current = reserves.indexOf(keyboardSlot ?? -1);
      keyboardSlot = reserves[current < 0 ? 0 : (current + (previous ? -1 : 1) + reserves.length) % reserves.length];
      keyboardSlotAt = now;
    }
  }
  for (let index = 0; index < 8; index++) {
    if (keyboard.consumePressed(`Digit${index + 1}`)) {
      selectedSlot = index;
      const source = keyboardSlot ?? reserves[0];
      if (source !== undefined && index < equipped && hotbarTypes[source] !== hotbarTypes[index]) {
        const layout = getHudLayout(canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi);
        petalMotion.sync(hotbarTypes, layout);
        for (const slot of [source, index]) petalMotion.adopt(slot, petalTransfers.detachSlot(slot));
        petalMotion.request(source, index, layout);
        void server.send(inputEncoder.swap(source, hotbarTypes[source], index, hotbarTypes[index] ?? 0));
        keyboardSlotAt = now;
      }
  
    }
  }
  if (keyboard.consumePressed('KeyT')) {
    const hovered = hotbarHover();
    const target = keyboardSlot ?? (typeof hovered === 'number' ? hovered : undefined);
    if (target !== undefined && hotbarTypes[target]) {
      const layout = getHudLayout(canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi);
      petalMotion.sync(hotbarTypes, layout);
      petalMotion.adopt(target, petalTransfers.detachSlot(target));
      petalMotion.request(target, 16, layout);
      void server.send(inputEncoder.discard(target, hotbarTypes[target]));
      if (keyboardSlot !== undefined) {
        keyboardSlot = reserves.find(slot => slot > target) ?? reserves.find(slot => slot !== target);
      }
      keyboardSlotAt = now;
    }
  }
}

function hoveredSlot(): number | undefined {
  const inventory = inventoryHover();
  if (inventory !== undefined) return inventory;
  if (inventoryOpen) return undefined;
  const hotbar = hotbarHover();
  return typeof hotbar === 'number' ? hotbar : undefined;
}

function hotbarHover(x = pointer.position.x, y = pointer.position.y): number | 'discard' | undefined {
  return hotbarSlotAt(x, y, canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi);
}

function handleMenuPointer(): void {
  if (started) return;
  menuControls.pointerMove(pointer.position.x, pointer.position.y);
  const press = pointer.consumeLeftPress();
  if (press) menuControls.pointerDown(press.x, press.y);
  menuControls.pointerDrag(pointer.position.x, pointer.position.y, pointer.buttons.left);
  pointer.consumeLeftRelease();
  pointer.consumeRightClick();
  pointer.consumeDoubleClick();
}

function handleHotbarPointer(): void {
  if (!started || dead) { pointer.consumeLeftPress(); pointer.consumeLeftRelease(); return; }
  const slotAtPointer = (): number | 'discard' | undefined => hotbarHover();
  const press = pointer.consumeLeftPress();
  if (press && dragSlot === undefined && dragInventorySlot === undefined) {
    const fromInventory = inventoryOpen ? inventorySlotAt(press.x, press.y, canvas.clientWidth, canvas.clientHeight) : undefined;
    const fromHotbar = hotbarHover(press.x, press.y);
    if (typeof fromInventory === 'number') dragInventorySlot = fromInventory;
    else if (typeof fromHotbar === 'number' && hotbarTypes[fromHotbar]) {
      const layout = getHudLayout(canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi);
      petalMotion.sync(hotbarTypes, layout);
      petalMotion.adopt(fromHotbar, petalTransfers.detachSlot(fromHotbar));
      if (petalMotion.begin(fromHotbar)) dragSlot = fromHotbar;
    }
  }
  if (pointer.consumeLeftRelease()) {
    let target = slotAtPointer();
    if (dragSlot !== undefined) {
      const layout = getHudLayout(canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi);
      const snap = petalMotion.target(layout, hotbarTypes, pointer.position.x / layout.scale, pointer.position.y / layout.scale);
      target = snap === 16 ? 'discard' : snap;
    }
    if (dragInventorySlot !== undefined) {
      const type = inventoryTypes[dragInventorySlot] ?? 0;
      if (typeof target === 'number') {
        void server.send(inputEncoder.swap(dragInventorySlot, type, target, hotbarTypes[target] ?? 0));
      } else if (target === 'discard') {
        void server.send(inputEncoder.discard(dragInventorySlot, type));
      }
    } else if (dragSlot !== undefined) {
      if (typeof target === 'number' && target !== dragSlot
          && target < hotbarTypes.length && dragSlot < hotbarTypes.length) {
        void server.send(inputEncoder.swap(dragSlot, hotbarTypes[dragSlot] ?? 0,
          target, hotbarTypes[target]));
      } else if (target === 'discard' && hotbarTypes[dragSlot]) {
        void server.send(inputEncoder.discard(dragSlot, hotbarTypes[dragSlot]));
      }
    }
    petalMotion.release(target === 'discard' ? 16 : target,
      getHudLayout(canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi));
    dragSlot = undefined;
    dragInventorySlot = undefined;
  }
  pointer.consumeRightClick();
  if (pointer.consumeDoubleClick()) {
    const slot = slotAtPointer();
    if (typeof slot === 'number' && slot < hotbarTypes.length && slot !== selectedSlot) {
      void server.send(inputEncoder.swap(selectedSlot, hotbarTypes[selectedSlot] ?? 0,
        slot, hotbarTypes[slot]));
    }
  }
}

/** Capture the final menu frame for the iris transition. */
function captureEntryCanvas(): void {
  if (!entryCanvas) entryCanvas = document.createElement('canvas');
  entryCanvas.width = canvas.width; entryCanvas.height = canvas.height;
  entryCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
}

/** Original spawn transition: the menu crossfades into an expanding iris
 * while a black ring sweeps over the garden. */
function drawEntryTransition(now: number): void {
  const progress = Math.max(0, Math.min(1, (now - (entryAt ?? now)) / 420));
  const width = canvas.width, height = canvas.height;
  const radius = 20 + progress * progress * Math.hypot(width, height) * 1.15;
  context2d.save(); context2d.setTransform(1, 0, 0, 1, 0, 0);
  const cx = width / 2, cy = height / 2 - 10 * dpr;
  context2d.beginPath(); context2d.rect(0, 0, width, height);
  context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
  context2d.fillStyle = '#1EA761'; context2d.fill('evenodd');
  if (entryCanvas) {
    // The menu is visible only outside the iris: the garden is revealed
    // through the hole, exactly like the native transition.
    context2d.save();
    context2d.beginPath(); context2d.rect(0, 0, width, height);
    context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
    context2d.clip('evenodd');
    context2d.drawImage(entryCanvas, 0, 0);
    context2d.restore();
  }
  context2d.beginPath(); context2d.arc(cx, cy, radius, 0, Math.PI * 2);
  context2d.strokeStyle = '#000'; context2d.lineWidth = Math.max(2, 6 * dpr); context2d.stroke();
  context2d.restore();
  if (progress >= 1) { entryAt = undefined; entryCanvas = undefined; }
}


/** Original death→menu transition: the captured death frame remains inside a
 * circular iris while the menu is revealed outside it. The radius decays with
 * the source's pow(.95, delta*0.06) curve; the ring is five UI units wide. */
function drawExitTransition(): void {
  // Original clientFrame's iris: a cubic ease over 62.5 rendered frames in the
  // menu's logical space, never wall-clock time. The black band shrinks with
  // the same progress after the first 41 frames.
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (width <= 0 || height <= 0) { exitAt = undefined; exitCanvas = undefined; return; }
  const scale = Math.fround(Math.max(0.7, Math.fround(Math.max(width * 0.000521, height * 0.000926))));
  const ui = Math.fround(scale * dpr);
  const logicalWidth = Math.ceil(Math.fround(width / scale));
  const logicalHeight = Math.ceil(Math.fround(height / scale));
  const cx = logicalWidth * 0.5, cy = logicalHeight * 0.5;
  exitFrame += 1;
  const remaining = 1 - exitFrame / 62.5;
  if (remaining <= 0) { exitAt = undefined; exitCanvas = undefined; return; }
  const radius = Math.fround(Math.hypot(logicalWidth, logicalHeight) * 0.5
    * Math.pow(remaining, 3));
  context2d.save();
  context2d.beginPath();
  context2d.setTransform(ui, 0, 0, ui, 0, 0);
  context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
  context2d.clip();
  context2d.setTransform(ui * logicalWidth, 0, 0, ui * logicalHeight, 0, 0);
  if (exitCanvas) context2d.drawImage(exitCanvas, 0, 0, 1, 1);
  context2d.restore();
  // The original paints the menu clipped *outside* the iris and then fills a
  // black band around the circle. Its width is 5 for the first 41 frames and
  // then shrinks to 0.12 as the iris closes; our menu is already on screen, so
  // paint the equivalent band as an annulus. Filling the outer circle while
  // the inner clip is active would hide the captured death frame entirely.
  const band = Math.min(5, 15 * remaining);
  context2d.save();
  context2d.setTransform(ui, 0, 0, ui, 0, 0);
  context2d.beginPath();
  context2d.arc(cx, cy, radius + band, 0, Math.PI * 2);
  context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
  context2d.fillStyle = '#000'; context2d.fill();
  context2d.restore();
}

/** Inventory grid hit test, matching the geometry in `render/ui.ts`. */
function inventoryHover(): number | undefined {
  if (!inventoryOpen) return undefined;
  return inventorySlotAt(pointer.position.x, pointer.position.y, canvas.clientWidth, canvas.clientHeight);
}

function frame(now: number): void {
  if (!running) return;
  const delta = Math.min(50, Math.max(0, now - last));
  last = now;
  handleUiKeys();
  handleMenuPointer();
  menuControls.advance(delta, pointer.buttons.left);
  handleHotbarPointer();
  const layout = getHudLayout(canvas.clientWidth, canvas.clientHeight, localPlayer()?.entity.level ?? 1, mobileUi);
  const mouseX = pointer.position.x / layout.scale, mouseY = pointer.position.y / layout.scale;
  const center = Math.trunc(layout.logicalWidth / 2);
  // Native hint expands into an inventory safe area, retained while the
  // pointer travels from the hint to the two rows. Leaving it resumes motion.
  const safeArea = movementDisabled ? Math.abs(mouseX - center) <= 320 && mouseY >= layout.logicalHeight - 200
    : Math.abs(mouseX - center) <= 150 && mouseY >= layout.logicalHeight - 35;
  movementDisabled = started && !dead && (safeArea || inventoryOpen || dragSlot !== undefined || dragInventorySlot !== undefined);
  // Native clientFrame chooses the menu renderer before draining a new
  // controlled body. Its first received player is rendered once into that
  // menu's hidden world/HUD, then the following frame enters the garden.
  const menuFrame = !enteredWorld;
  const player = localPlayer();
  const deathInfo = world.deathMetadata();
  // Capture on receipt as well as RAF: a worker flush can deliver corpse and
  // removal together. Keep the first death's complete inventory/statistics.
  deathLifecycle.observe(world);
  const retainedDeath = deathLifecycle.snapshot;
  if (deathLifecycle.dead && retainedDeath) {
    lastDeathMetadata = retainedDeath.metadata;
    lastSlots = [...retainedDeath.slots];
    lastLevel = retainedDeath.level;
  } else if (!dead) lastDeathMetadata = deathInfo;
  const deathProgress = deathLifecycle.advance(delta);
  const corpse = world.playerEntity();
  if (corpse !== undefined && started && enteredWorld && corpse.health <= 0) {
    dead = true;
    deathAt ??= now;
  }
  if (menuFrame && player !== null) entryAt = now;
  // The native hint only opens from the small bottom pill; once opened the
  // pointer may travel through the taller inventory safe area.
  const hintReachX = hintExpand > 0.05 ? 315 : 150;
  const hintReachY = hintExpand > 0.05 ? 192 : 35;
  const hintTarget = started && !dead && !menuFrame && !inventoryOpen
    && Math.abs(mouseX - center) <= hintReachX && mouseY >= layout.logicalHeight - hintReachY ? 1 : 0;
  hintExpand += (hintTarget - hintExpand) * (1 - Math.pow(0.7, delta * 0.06));
  if (Math.abs(hintTarget - hintExpand) < 0.001) hintExpand = hintTarget;
  const hintKeyTarget = keyboardSlot !== undefined ? 1 : 0;
  keyboardHint = Math.fround(Math.abs(hintKeyTarget - keyboardHint) < 1e-7 ? hintKeyTarget
    : keyboardHint + (hintKeyTarget - keyboardHint) * (1 - Math.pow(0.6, Math.fround(delta) * 0.06)));
  const deleteTarget = +(keyboardSlot !== undefined || dragSlot !== undefined);
  deleteAlpha = Math.fround(Math.abs(deleteTarget - deleteAlpha) < 1e-7 ? deleteTarget
    : deleteAlpha + (deleteTarget - deleteAlpha) * (1 - Math.pow(0.7, Math.fround(delta) * 0.06)));
  if (keyboardSlot !== undefined && keyboardSlot < layout.equippedCount + 8) {
    const equippedSlot = keyboardSlot < layout.equippedCount;
    const targetX = (equippedSlot ? layout.equippedX + keyboardSlot * 90
      : layout.storageX + (keyboardSlot - layout.equippedCount) * 65) * layout.scale;
    const targetY = (equippedSlot ? layout.equippedY : layout.storageY) * layout.scale;
    const targetSize = equippedSlot ? 74 : 54;
    if (!keyboardHighlightReady) {
      keyboardHighlightX = targetX; keyboardHighlightY = targetY; keyboardHighlightReady = true;
    } else {
      const follow = 1 - Math.pow(0.65, delta / 16);
      keyboardHighlightX += (targetX - keyboardHighlightX) * follow;
      keyboardHighlightY += (targetY - keyboardHighlightY) * follow;
    }
    keyboardHighlightSize += (targetSize - keyboardHighlightSize) * (1 - Math.pow(0.65, delta / 16));
    keyboardHighlightAlpha += (1 - keyboardHighlightAlpha) * (1 - Math.pow(0.7, delta * 0.06));
  } else {
    keyboardHighlightAlpha += (0 - keyboardHighlightAlpha) * (1 - Math.pow(0.7, delta * 0.06));
  }
  if (Math.abs(keyboardHighlightAlpha) < 0.001) keyboardHighlightAlpha = 0;
  if (keyboardSlot !== undefined) petalMotion.adopt(keyboardSlot, petalTransfers.detachSlot(keyboardSlot));
  const slotMotions = petalMotion.update(layout, hotbarTypes, now, delta,
    pointer.position.x, pointer.position.y, keyboardSlot,
    !pointer.buttons.left && dragSlot === undefined ? hoveredSlot() : undefined);
  const menuHover = menuControls.renderState();
  let clickable = false;
  if (!started) {
    clickable = !!menuHover.hoveredTab;
    if (menuHover.panel) {
      const menuScale = Math.fround(Math.max(0.7, Math.fround(Math.max(canvas.clientWidth * 0.000521, canvas.clientHeight * 0.000926))));
      const height = Math.ceil(Math.fround(canvas.clientHeight / menuScale));
      const alpha = menuHover.panelAlphas?.[menuHover.panel] ?? 1;
      const close = menuCloseRect(menuHover.panel, height, alpha);
      clickable ||= menuHover.pointerX >= close.x && menuHover.pointerX <= close.x + close.width
        && menuHover.pointerY >= close.y && menuHover.pointerY <= close.y + close.height;
      clickable ||= menuHover.panel === 'Settings' && settingsRowAt(menuHover.pointerX, menuHover.pointerY, height, alpha) !== undefined;
      if (menuHover.panel !== 'Settings') {
        const content = menuContentRect(menuHover.panel, height, alpha);
        const max = menuScrollMax(menuHover.panel, height, menuHover.mobs);
        clickable ||= max > 0 && menuHover.pointerX >= content.x + content.width - 14
          && menuHover.pointerX <= content.x + content.width
          && menuHover.pointerY >= content.y && menuHover.pointerY <= content.y + content.height;
      }
    }
  } else if (!dead) {
    const hovered = hoveredSlot();
    clickable = dragSlot !== undefined || (hovered !== undefined && !!(inventoryOpen ? inventoryTypes[hovered] : hotbarTypes[hovered]));
  }
  canvas.style.cursor = clickable ? 'pointer' : 'default';
  void audio;
  if (player !== null) {
    enteredWorld = true;
    // The archived updateCamera follows the entity-table interpolation, not
    // the raw snapshot position; use the same 120 ms transform the renderer
    // uses so the camera target and the drawn player stay in step.
    const target = interpolateCameraTarget(player.entity, now);
    const displayed = playerTransform.get(player.entity, now, { x: camera.panX, y: camera.panY });
    const panInput = {
      displayedX: displayed.x, displayedY: displayed.y,
      mouseX: pointer.position.x, mouseY: pointer.position.y,
      cameraX: camera.x, cameraY: camera.y, zoom: camera.zoom,
      viewportWidth: camera.viewportWidth, viewportHeight: camera.viewportHeight,
      deltaMs: delta, enabled: !mobileUi && !movementDisabled,
    };
    pointerMovement = getPointerMovement(panInput);
    const pan = updatePanState({ x: camera.panX, y: camera.panY }, panInput);
    camera.panX = pan.x; camera.panY = pan.y;
    // Native queuePlayerInput precedes transform-cache invalidation. Refresh
    // the render's transform only after consuming that previous-frame cache.
    playerTransform.invalidate();
    playerTransform.get(player.entity, now, pan);
    const hitAt = world.hitTime(player.entity.handle);
    if (hitAt !== undefined) camera.markHit(hitAt);
    // Original updateCamera scans the equipped petal slots: Antennae widens
    // the view from a 0.9 to a 0.63 scene scale.
    const equipped = Math.min(16, equippedSlotCount(player.entity.level ?? 1));
    const antennae = (playerLoadoutSlots(player.entity) ?? []).slice(0, equipped).includes(25);
    camera.follow(target.x, target.y, delta, pan.x, pan.y, now, antennae ? 0.63 : 0.9);
    status = '';
    dead = false;
    deathAt = undefined;
  } else if (started && enteredWorld) {
    dead = true;
    deathAt ??= now;
  }
  menuControls.show(!started && !frozen);
  // A same-camera recording belongs to this drawing pass. Native input above
  // uses the previous rendered camera, before updateCamera installs this one.
  if (pendingRenderCamera) {
    camera.setCamera(...pendingRenderCamera);
    pendingRenderCamera = undefined;
  }
  context2d.setTransform(1, 0, 0, 1, 0, 0);
  context2d.clearRect(0, 0, canvas.width, canvas.height);
  let playerHudState: HudState | undefined;
  if (player) {
    const displaySlots = playerLoadoutSlots(player.entity) ?? loadoutSlots(world.all(), 16);
    lastSlots = displaySlots.slice();
    lastLevel = player.entity.level ?? 1;
    inventoryTypes = displaySlots;
    hotbarTypes.splice(0, hotbarTypes.length, ...displaySlots);
    menuControls.discover(displaySlots, [...world.all()]
      .filter(entity => entity.kind === 2 && MOB_INFO[entity.speciesId ?? 0])
      .map(entity => [entity.speciesId!, MOB_INFO[entity.speciesId!].name] as const));
    playerHudState = {
      health: player.entity.health, maxHealth: player.entity.maxHealth,
      level: player.entity.level ?? 1, levelProgress: player.entity.levelProgress,
      zoneProgress: typeof (player.entity.byteFields?.[63] ?? player.entity.denseByteFields?.[63]
        ?? player.entity.denseFields?.[63]) === 'number'
        ? (player.entity.byteFields?.[63] ?? player.entity.denseByteFields?.[63]
          ?? player.entity.denseFields?.[63]) as number : 0,
      score: player.entity.score, pixelRatio: dpr, chat: world.chat,
      scoreTransition: player.entity.receivedScoreAt === undefined ? undefined
        : { previous: player.entity.previousScore ?? player.entity.score ?? 0,
          receivedAt: player.entity.receivedScoreAt },
      width: canvas.clientWidth, height: canvas.clientHeight,
      mobile: mobileUi, playerX: player.entity.x, arenaWidth: 50000,
      slots: displaySlots, selectedSlot, inventoryOpen,
      playerName: menuControls.name.value || undefined, keyboardMovement: menuControls.keyboardMovement,
      movementDisabled, draggedSlot: dragSlot, keyboardSlot,
      keyboardHint, hintExpand, deleteAlpha,
      keyboardHighlightX, keyboardHighlightY, keyboardHighlightSize, keyboardHighlightAlpha,
      slotMotions,
      petalDiscoveries: menuControls.petalDiscoveryCount,
      slotProgress: playerSlotProgress(player.entity),
      hoveredSlot: hoveredSlot(), pointerX: pointer.position.x, pointerY: pointer.position.y,
    };
  }
  const drawFrameHud = (state: HudState): void => {
    const target = state.menuPreviewState ?? state;
    const slotEffects = petalTransfers.update(now, delta, target.slots ?? [], target.slotProgress, {
      width: target.width, height: target.height, level: target.level,
      mobile: target.mobile, uiScale: target.uiScale, pixelRatio: target.pixelRatio,
    });
    const updated = hudState.update({ ...target, slotEffects }, now, delta);
    drawHud(renderContext, state.menuPreviewState ? { ...state, menuPreviewState: updated } : updated);
  };
  const drawMovementGuide = (): void => {
    if (player) helperPlayer = playerTransform.get(player.entity, now, { x: camera.panX, y: camera.panY });
    if (!helperPlayer) return;
    movementHelper.draw(renderContext, {
      enabled: menuControls.movementHelper, keyboardMovement: menuControls.keyboardMovement,
      mobile: mobileUi, alive: player !== null, deltaMs: delta,
      pointerX: pointer.position.x, pointerY: pointer.position.y,
      playerX: helperPlayer.x, playerY: helperPlayer.y, cameraX: camera.x, cameraY: camera.y,
      zoom: camera.zoom, viewportWidth: camera.viewportWidth, viewportHeight: camera.viewportHeight,
      pixelRatio: dpr,
    });
  };
  if (menuFrame) {
    drawFrameHud({
      health: 100, maxHealth: 100, level: 1, pixelRatio: dpr, menu: true, interactiveMenu: !frozen, status,
      animationTime: now + animationOffset,
      width: canvas.clientWidth, height: canvas.clientHeight,
      mobile: mobileUi, petalDiscoveries: menuControls.petalDiscoveryCount,
      menuState: menuControls.renderState(), menuPetalTypes: menuControls.discoveredPetals,
      menuRespawn,
      menuPreviewState: playerHudState,
      menuPreview: (preview, view) => {
        menuCamera.resize(view.width, view.height, view.pixelRatio);
        menuCamera.x = view.cameraX; menuCamera.y = view.cameraY; menuCamera.zoom = view.zoom;
        drawWorld(preview, world, menuCamera, now, { menuPreview: true });
        return world.lastSequence > 0;
      },
    });
    if (menuFrame && player !== null) captureEntryCanvas();
  } else if (player === null) {
    drawWorld(renderContext, world, camera, now);
    drawMovementGuide();
    drawFrameHud({
      health: 0, maxHealth: 100, level: lastLevel, pixelRatio: dpr,
      chat: world.chat, death: true, slots: lastSlots, selectedSlot,
      flowers: 0, flowerEntries: [],
      deathState: {
        elapsedMilliseconds: Math.max(0, now - (deathAt ?? now)),
        progress: deathProgress,
        killerName: lastDeathMetadata.killerName || 'A mysterious entity',
        respawnLevel: lastDeathMetadata.deathLevel || lastLevel,
        score: lastDeathMetadata.score,
        keptSlots: lastSlots,
      },
      width: canvas.clientWidth, height: canvas.clientHeight,
      mobile: mobileUi,
    });
  } else {
    drawWorld(renderContext, world, camera, now);
    drawMovementGuide();
    drawFrameHud(playerHudState!);
  }
  if (entryAt !== undefined && player !== null) drawEntryTransition(now);
  if (exitAt !== undefined && !enteredWorld) drawExitTransition();
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', event => {
  if (!started || !enteredWorld || frozen) return;
  event.preventDefault();
  event.returnValue = '';
});

void boot();
