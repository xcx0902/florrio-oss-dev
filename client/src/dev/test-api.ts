import { CameraState } from '../state/camera.js';
import { type EntitySnapshot, type SnapshotEvent } from '../state/snapshot.js';
import { WorldState } from '../state/world.js';
import type { GameApp } from '../app/game-app.js';
declare global {
  interface Window {
    __florr?: {
      world: WorldState;
      camera: CameraState;
      freeze(): void;
      resume(): void;
      start(): Promise<void>;
      readonly ui: {
        readonly started: boolean;
        readonly inventoryOpen: boolean;
        readonly selectedSlot: number;
        readonly dead: boolean;
        readonly status: string;
        readonly menuPanel: string | undefined;
        readonly movementDisabled: boolean;
        readonly name: string;
        readonly keyboardSlot: number | undefined;
        readonly keyboardHint: number;
        readonly keyboardHighlightAlpha: number;
        readonly menuScroll: Readonly<Record<string, number>>;
      };
      setSnapshot(entities: readonly EntitySnapshot[], events?: readonly SnapshotEvent[]): void;
      /** Replace a product fixture at an explicit client clock. */
      setSnapshotAt(entities: readonly EntitySnapshot[], at: number): void;
      /** Replay bytes through the production decoder and delta receiver. */
      applyPacketAt(bytes: readonly number[], at: number): boolean;
      /** Select a repeatable performance-workload camera. */
      setCamera(x: number, y: number, zoom?: number, entityOffsetX?: number, entityOffsetY?: number): void;
      getCamera(): {
        x: number;
        y: number;
        zoom: number;
      };
      clearCameraOverride(): void;
      /** Test/diagnostic hooks that speak the real opcode 3/4 protocol. */
      suicide(): Promise<void>;
      restart(): Promise<void>;
    };
  }
}
export function installTestApi(app: GameApp): () => void {
  window.__florr = {
    world: app.world,
    camera: app.camera,
    freeze: () => { app.frozen = true; },
    resume: () => { app.frozen = false; app.camera.clearOverride(); },
    start: async () => app.session.startGame(),
    get ui() {
      return { started: app.session.started, inventoryOpen: app.loadout.inventoryOpen, selectedSlot: app.loadout.selectedSlot, dead: app.session.dead, status: app.session.status, menuPanel: app.menuControls.panel, movementDisabled: app.input.movementDisabled, name: app.menuControls.name.value, keyboardSlot: app.loadout.keyboardSlot, keyboardHint: app.renderer.keyboardHint, keyboardHighlightAlpha: app.renderer.keyboardHighlightAlpha, menuScroll: app.menuControls.renderState().scroll };
    },
    suicide: async () => { await app.server.send(app.inputEncoder.suicide()); },
    restart: async () => { await app.session.restartGame(); },
    setCamera: (x, y, zoom, offsetX, offsetY) => { app.camera.setCamera(x, y, zoom, offsetX, offsetY); },
    getCamera: () => app.camera.getCamera(),
    clearCameraOverride: () => { app.camera.clearOverride(); },
    setSnapshot: (entities, events = []) => {
      app.injectedSequence += 1;
      app.world.reset();
      app.session.deathLifecycle.reset();
      app.camera.reset();
      app.renderer.hudState.reset();
      app.renderer.playerTransform.invalidate();
      app.renderer.petalTransfers.reset();
      app.session.enterMenu();
      app.camera.clearOverride();
      // An empty reset is not a received server metadata packet. In particular
      // the menu's preview HUD must wait for the first real snapshot.
      if (entities.length || events.length)
        app.world.applyFullSnapshot({ sequence: app.injectedSequence, serverTime: 0, entities, events }, performance.now());
      app.session.localPlayer() ? app.session.enterPlaying() : app.session.enterMenu();
    },
    setSnapshotAt: (entities, at) => {
      app.injectedSequence += 1;
      app.world.applyFullSnapshot({ sequence: app.injectedSequence, serverTime: at, entities, events: [] }, at);
    },
    applyPacketAt: (bytes, at) => app.session.applyPacket(Uint8Array.from(bytes), at),
  };
  const installed = window.__florr;
  return () => { if (window.__florr === installed)
    delete window.__florr; };
}
