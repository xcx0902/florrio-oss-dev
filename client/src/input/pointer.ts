export interface PointerPosition { readonly x: number; readonly y: number; }

/** Pointer state in CSS pixels relative to the canvas. */
export class PointerInput {
  readonly position: PointerPosition = { x: 0, y: 0 };
  readonly buttons = { left: false, right: false };
  private rightClickPending = false;
  private doubleClickPending = false;
  private leftReleasePending = false;
  private leftPressPending: PointerPosition | undefined;
  private lastLeftDownMs = -1000;
  private lastLeftX = 0;
  private lastLeftY = 0;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('blur', () => this.reset());
    canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  private readonly onMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    (this.position as { x: number; y: number }).x = event.clientX - rect.left;
    (this.position as { x: number; y: number }).y = event.clientY - rect.top;
  };
  private readonly onDown = (event: PointerEvent): void => {
    this.onMove(event);
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (event.button === 0) {
      const now = performance.now();
      if (now - this.lastLeftDownMs < 300 && Math.hypot(x - this.lastLeftX, y - this.lastLeftY) < 12)
        this.doubleClickPending = true;
      this.lastLeftDownMs = now;
      this.lastLeftX = x;
      this.lastLeftY = y;
      this.buttons.left = true;
      this.leftPressPending = { x, y };
    }
    if (event.button === 2) {
      this.rightClickPending = true;
      this.buttons.right = true;
    }
  };
  consumeLeftPress(): PointerPosition | undefined {
    const pending = this.leftPressPending; this.leftPressPending = undefined; return pending;
  }
  reset(): void {
    this.buttons.left = this.buttons.right = false;
    this.leftPressPending = undefined;
    this.leftReleasePending = this.rightClickPending = this.doubleClickPending = false;
  }
  /** Consume a right-click edge (one shot). */
  consumeRightClick(): boolean {
    const pending = this.rightClickPending;
    this.rightClickPending = false;
    return pending;
  }
  /** Consume a double-left-click edge (one shot). */
  consumeDoubleClick(): boolean {
    const pending = this.doubleClickPending;
    this.doubleClickPending = false;
    return pending;
  }
  /** Consume a left-button release edge (one shot). */
  consumeLeftRelease(): boolean {
    const pending = this.leftReleasePending;
    this.leftReleasePending = false;
    return pending;
  }
  private readonly onUp = (event: PointerEvent): void => {
    this.onMove(event);
    if (event.button === 0) {
      this.buttons.left = false;
      this.leftReleasePending = true;
    }
    if (event.button === 2) this.buttons.right = false;
  };
}
