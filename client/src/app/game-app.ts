import { getHudLayout } from '../ui/layout/hud.js';
import { GameSession } from '../app/game-session.js';
import { SimulationLoop } from '../app/simulation-loop.js';
import { SilentAudioBus } from '../audio/audio.js';
import { GameInput } from '../input/game-input.js';
import { LoadoutController } from '../input/loadout-controller.js';
import { MenuControls } from '../input/menu.js';
import { InputPacketEncoder } from '../net/input.js';
import { ServerWorkerClient } from '../net/worker.js';
import { wrapContext } from '../render/canvas2d/context.js';
import { FrameRenderer } from '../render/frame-renderer.js';
import { Transitions } from '../render/transitions.js';
import { CameraState } from '../state/camera.js';
import { WorldState } from '../state/world.js';
export class GameApp {
  world: WorldState;
  camera: CameraState;
  menuCamera: CameraState;
  mobileUi: boolean;
  frozen: boolean;
  injectedSequence: number;
  audio: SilentAudioBus;
  server: ServerWorkerClient;
  inputEncoder: InputPacketEncoder;
  renderContext: import('../render/canvas2d/context.js').Canvas2DContext;
  menuControls: MenuControls;
  running: boolean;
  dpr: number;
  readonly canvas: HTMLCanvasElement;
  readonly context2d: CanvasRenderingContext2D;
  readonly listeners = new AbortController();
  disposed = false;
  animationFrame = 0;
  removeTestApi?: () => void;
  removeCheatPanel?: () => void;
  private starting?: Promise<void>;
  private lastFrame: number;
  readonly session: GameSession;
  readonly simulation: SimulationLoop;
  readonly input: GameInput;
  readonly loadout: LoadoutController;
  readonly renderer: FrameRenderer;
  readonly transitions: Transitions;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Canvas2D unavailable');
    this.context2d = context;
    this.world = new WorldState();
    this.camera = new CameraState();
    this.menuCamera = new CameraState();
    this.mobileUi = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.frozen = false;
    this.injectedSequence = 0;
    this.audio = new SilentAudioBus();
    this.server = new ServerWorkerClient();
    this.inputEncoder = new InputPacketEncoder();
    this.renderContext = wrapContext(this.context2d);
    this.menuControls = new MenuControls();
    this.running = true;
    this.dpr = 1;
    this.input = new GameInput(this);
    this.loadout = new LoadoutController(this);
    this.transitions = new Transitions(this);
    this.renderer = new FrameRenderer(this);
    this.lastFrame = performance.now();
    this.session = new GameSession(this);
    this.simulation = new SimulationLoop(this);
    this.camera.zoom = 2 / 3;
    this.canvas.addEventListener('wheel', event => {
      // Mouse wheel: deltaY/175, multiplied by three for the
      // Chrome wheelDeltaY convention, then adjusted for line/page delta modes.
      const legacyWheel = event as WheelEvent & {
        wheelDeltaY?: number;
      };
      let delta = event.deltaY / 175;
      if (legacyWheel.wheelDeltaY !== undefined ? legacyWheel.wheelDeltaY === -3 * event.deltaY
        : event.deltaMode === 0)
        delta *= 3;
      if (event.deltaMode === 1)
        delta /= 18;
      else if (event.deltaMode === 2)
        delta /= 1000;
      if (!this.session.started && this.menuControls.wheel(delta))
        event.preventDefault();
    }, { passive: false, signal: this.listeners.signal });
    window.addEventListener('beforeunload', event => {
      if (!this.session.started || !this.session.enteredWorld || this.frozen)
        return;
      event.preventDefault();
      event.returnValue = '';
    }, { signal: this.listeners.signal });
  }
  resize = (): void => {
    this.dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.resize(width, height, this.dpr);
    this.menuControls.resize(width, height);
  };
  installDevelopmentCheats = (): void => {
    if (!new URLSearchParams(location.search).has('cheat'))
      return;
    void import('../dev/cheat.js').then(({ installCheatPanel }) => {
      if (this.disposed)
        return;
      this.removeCheatPanel = installCheatPanel({
        coordinates: () => {
          const player = this.session.localPlayer();
          return player ? { x: player.entity.x, y: player.entity.y } : undefined;
        },
        loadout: () => this.loadout.hotbarTypes.slice(0, 8),
        setPetal: async (slot, type) => {
          await this.session.ensureServer();
          const bytes = new Uint8Array([slot & 255, type & 255, (type >>> 8) & 255]);
          await this.server.request('sp_server_debug_set_loadout_slot', bytes);
        },
        spawnMob: async (type, x, y) => {
          await this.session.ensureServer();
          const bytes = new Uint8Array(10);
          const view = new DataView(bytes.buffer);
          view.setUint16(0, type, true);
          view.setFloat32(2, x, true);
          view.setFloat32(6, y, true);
          await this.server.request('sp_server_debug_spawn_mob', bytes);
        },
        teleport: async (x, y) => {
          await this.session.ensureServer();
          const bytes = new Uint8Array(8);
          const view = new DataView(bytes.buffer);
          view.setFloat32(0, x, true);
          view.setFloat32(4, y, true);
          await this.server.request('sp_server_debug_set_player_position', bytes);
        },
      });
    });
  };
  boot = async (): Promise<void> => {
    this.resize();
    window.addEventListener('resize', this.resize, { signal: this.listeners.signal });
    // The Ubuntu face is declared with @font-face and only starts loading when a
    // draw uses it; force it before the first frame so every recorded frame uses
    // the same metrics (otherwise frame 1 falls back and the trace is flaky).
    try {
      await document.fonts.load('bold 24px Ubuntu, sans-serif');
    }
    catch { /* keep the fallback */ }
    await document.fonts.ready;
    if (this.disposed)
      return;
    document.getElementById('status')?.remove();
    this.menuControls.name.focus({ preventScroll: true });
    this.simulation.start();
    this.installDevelopmentCheats();
    this.animationFrame = requestAnimationFrame(this.frame);
  };
  private frame = (now: number): void => {
    if (!this.running) return;
    const delta = Math.min(50, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    this.loadout.handleUiKeys();
    this.handleMenuPointer();
    this.menuControls.advance(delta, this.input.pointer.buttons.left);
    this.loadout.handleHotbarPointer();
    const layout = getHudLayout(this.canvas.clientWidth, this.canvas.clientHeight,
      this.session.localPlayer()?.entity.level ?? 1, this.mobileUi);
    this.input.updateMovementDisabled(layout);
    const view = this.session.prepareFrame(now, delta);
    this.renderer.frame(now, delta, layout, view);
    if (this.running) this.animationFrame = requestAnimationFrame(this.frame);
  };
  handleMenuPointer = (): void => {
    if (this.session.started)
      return;
    this.menuControls.pointerMove(this.input.pointer.position.x, this.input.pointer.position.y);
    const press = this.input.pointer.consumeLeftPress();
    if (press)
      this.menuControls.pointerDown(press.x, press.y);
    this.menuControls.pointerDrag(this.input.pointer.position.x, this.input.pointer.position.y, this.input.pointer.buttons.left);
    this.input.pointer.consumeLeftRelease();
    this.input.pointer.consumeRightClick();
    this.input.pointer.consumeDoubleClick();
  };
  start(): Promise<void> {
    return this.starting ??= this.startOnce();
  }
  private async startOnce(): Promise<void> {
    if (this.disposed) throw new Error('Application disposed');
    if (new URLSearchParams(location.search).has('test')) {
      const { installTestApi } = await import('../dev/test-api.js');
      if (this.disposed) return;
      this.removeTestApi = installTestApi(this);
    }
    await this.boot();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.session.invalidate();
    this.simulation.stop();
    cancelAnimationFrame(this.animationFrame);
    this.listeners.abort();
    this.input.dispose();
    this.menuControls.dispose();
    this.server.terminate();
    this.transitions.dispose();
    this.renderer.dispose();
    this.removeCheatPanel?.();
    this.removeTestApi?.();
  }
}
