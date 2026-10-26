import type { Canvas2DContext } from './canvas2d/context.js';

export interface MovementHelperInput {
  readonly enabled: boolean;
  readonly keyboardMovement: boolean;
  readonly mobile: boolean;
  readonly alive: boolean;
  readonly deltaMs: number;
  /** Pointer and viewport dimensions are CSS pixels; zoom is CSS pixels/world unit. */
  readonly pointerX: number;
  readonly pointerY: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pixelRatio: number;
}

const f = Math.fround;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const ease = (current: number, target: number, base: number, elapsed: number): number =>
  Math.abs(current - target) < 1e-7 ? f(target)
    : f(current + (target - current) * clamp(1 - Math.pow(base, elapsed * 0.06)));

/** Original mouse guide: independently smooth the mouse and alive opacity,
 * then draw its world-space arrow. Camera/input state is never modified.
 * Invisible strokes are omitted so draw() reports visible submissions.
 */
export class MovementHelper {
  private visibility = 0;
  private mouseX = 0;
  private mouseY = 0;

  reset(): void {
    this.visibility = this.mouseX = this.mouseY = 0;
  }

  /** Returns true only when a nontransparent arrow is stroked. Disabled
   * modes preserve smoothing state and make no calls to the context. */
  draw(context: Canvas2DContext, input: MovementHelperInput): boolean {
    if (!input.enabled || input.keyboardMovement || input.mobile) return false;
    const { pointerX, pointerY, playerX, playerY, cameraX, cameraY,
      viewportWidth, viewportHeight, pixelRatio, deltaMs } = input;
    const zoom = f(input.zoom);
    if (![pointerX, pointerY, playerX, playerY, cameraX, cameraY, zoom,
      viewportWidth, viewportHeight, pixelRatio, deltaMs].every(Number.isFinite)
      || zoom <= 0 || pixelRatio <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return false;

    const elapsed = f(Math.max(0, deltaMs));
    const worldX = f(f(cameraX) + f(f(f(pointerX) - viewportWidth * 0.5) / zoom));
    const worldY = f(f(cameraY) + f(f(f(pointerY) - viewportHeight * 0.5) / zoom));
    this.visibility = ease(this.visibility, input.alive ? 1 : 0, 0.7, elapsed);
    this.mouseX = ease(this.mouseX, worldX, 0.6, elapsed);
    this.mouseY = ease(this.mouseY, worldY, 0.6, elapsed);

    // The original fade scales absolute world coordinates, not a vector
    // relative to the player. Keep that observable startup/death behavior.
    const tipX = f(clamp(this.visibility) * this.mouseX);
    const tipY = f(clamp(this.visibility) * this.mouseY);
    const dx = tipX - playerX, dy = tipY - playerY;
    const distance = f(Math.sqrt(dx * dx + dy * dy));
    const distanceAlpha = clamp(distance * 0.02 - 2);
    if (this.visibility <= 0 || distanceAlpha <= 0) return false;
    const alpha = clamp(clamp((context.getGlobalAlpha?.() ?? 1) * (this.visibility * 0.2)) * distanceAlpha);
    if (!(alpha > 0)) return false;

    const angle = f(Math.atan2(dy, dx));
    const wing = (offset: number): readonly [number, number] => {
      const direction = f(angle + offset);
      return [f(tipX + f(this.visibility * f(f(Math.cos(direction)) * 50))),
        f(tipY + f(this.visibility * f(f(Math.sin(direction)) * 50)))];
    };
    const left = wing(2.5132741228718345), right = wing(-2.5132741228718345);
    const scale = f(zoom * pixelRatio);
    context.save();
    try {
      context.setTransform(scale, 0, 0, scale,
        f((viewportWidth * 0.5 - cameraX * zoom) * pixelRatio),
        f((viewportHeight * 0.5 - cameraY * zoom) * pixelRatio));
      context.setGlobalAlpha(alpha);
      context.setLineCap('round'); context.setLineJoin('round'); context.setLineWidth(20);
      context.beginPath();
      context.moveTo(playerX + f(f(Math.cos(angle)) * 50), playerY + f(f(Math.sin(angle)) * 50));
      context.lineTo(tipX, tipY);
      context.lineTo(left[0], left[1]);
      context.lineTo(tipX, tipY);
      context.lineTo(right[0], right[1]);
      context.setStrokeRgb(51, 51, 51); context.stroke();
    } finally { context.restore(); }
    return true;
  }
}
