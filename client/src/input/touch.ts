export interface JoystickVector { readonly x: number; readonly y: number; readonly active: boolean; }

/** Single-stick touch input. Coordinates are normalized to [-1, 1]. */
export class TouchJoystick {
  readonly vector: JoystickVector = { x: 0, y: 0, active: false };
  private readonly element: HTMLElement;
  private center: { x: number; y: number } | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    element.addEventListener('touchstart', this.onStart, { passive: false });
    element.addEventListener('touchmove', this.onMove, { passive: false });
    element.addEventListener('touchend', this.onEnd);
    element.addEventListener('touchcancel', this.onEnd);
  }

  private readonly onStart = (event: TouchEvent): void => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const rect = this.element.getBoundingClientRect();
    this.center = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    (this.vector as { x: number; y: number; active: boolean }).active = true;
    event.preventDefault();
  };
  private readonly onMove = (event: TouchEvent): void => {
    if (!this.center) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const rect = this.element.getBoundingClientRect();
    const dx = (touch.clientX - rect.left) - this.center.x;
    const dy = (touch.clientY - rect.top) - this.center.y;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, length / 48);
    (this.vector as { x: number; y: number }).x = (dx / length) * scale;
    (this.vector as { x: number; y: number }).y = (dy / length) * scale;
    event.preventDefault();
  };
  private readonly onEnd = (): void => {
    this.center = null;
    (this.vector as { x: number; y: number; active: boolean }).active = false;
    (this.vector as { x: number; y: number }).x = 0;
    (this.vector as { x: number; y: number }).y = 0;
  };
}
