/**
 * Camera state recovered from the archived client's `updateCamera` (func 763).
 *
 * The archived camera keeps a resolved scene scale at `camera + 12` and derives
 * the screen projection as
 *
 *   pixelsPerWorld = f32(scale * max(f32(viewportH / 1080), f32(viewportW / 1920)))
 *
 * `zoom` remains that pixels-per-world value so the renderer and hit-testing
 * API are unchanged. The scale starts at 1.0 (the menu camera) and relaxes to
 * the player's 0.9 target with `1 - 0.8^(dt * 0.06)`.
 *
 * Camera position targets the entity-table interpolated player plus the
 * mouse-pan offset (`state + 2048` / `state + 2052`). While a controlled player
 * exists the archived client raises the follow coefficient to 1 immediately
 * (the 0.95 exponential in the recovered body is the ramp, and the effective
 * coefficient is 1); the camera therefore lands exactly on the interpolated
 * target. Startup, before any player exists, has coefficient 0.2. We keep the
 * ramp state so the recovered formula remains visible, but initialise it to the
 * controlled-player value.
 */
const INITIAL_SCALE = 1;
const PLAYER_SCALE = 0.9;
const ZOOM_SMOOTHING = 0.8;
const FOLLOW_RAMP = 0.95;
/** The archived client snaps to the first followed player. */
const FIRST_PLAYER_SMOOTHING = 1;

export interface CameraProjection {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export class CameraState {
  x = 0;
  y = 0;
  pixelRatio = 1;
  viewportWidth = 1280;
  viewportHeight = 720;
  /** Archived `camera + 12`; `zoom` projects it through the viewport factor. */
  private scale = INITIAL_SCALE;
  /** Extra screen-space pan of the entity layer (archived camera shake / pan).
   * The grid and arena bands do not receive it, which is why the archived
   * player sits ~3 px lower than the band-derived camera alone predicts. */
  entityOffsetX = 0;
  entityOffsetY = 0;
  /** Native input pan is applied in world units before player clamping. */
  panX = 0;
  panY = 0;
  private smoothing = FIRST_PLAYER_SMOOTHING;
  private initialized = false;
  private manual = false;
  private pinnedZoom: number | undefined;
  private hitAt = -Infinity;
  private shake = 0;
  private clock = 0;

  /** Native selectValue(height, width, width < height) selects the maximum. */
  get viewportFactor(): number {
    return Math.max(Math.fround(this.viewportHeight * Math.fround(1 / 1080)),
      Math.fround(this.viewportWidth * Math.fround(1 / 1920)));
  }

  /** Screen pixels per world unit (the archived `pixelsPerWorld`). */
  get zoom(): number {
    return this.pinnedZoom ?? Math.fround(this.scale * this.viewportFactor);
  }

  set zoom(value: number) {
    const factor = this.viewportFactor;
    this.scale = factor > 0 ? value / factor : value;
    this.pinnedZoom = value;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.pixelRatio = pixelRatio > 0 ? pixelRatio : 1;
  }

  reset(): void {
    this.initialized = false;
    this.manual = false;
    this.pinnedZoom = undefined;
    this.x = 0;
    this.y = 0;
    this.entityOffsetX = 0;
    this.entityOffsetY = 0;
    this.panX = 0;
    this.panY = 0;
    this.scale = INITIAL_SCALE;
    this.smoothing = FIRST_PLAYER_SMOOTHING;
    this.hitAt = -Infinity;
    this.shake = 0;
    this.clock = 0;
  }

  /** Follow the already-interpolated player target and pan offset. */
  markHit(at: number): void { if (Number.isFinite(at)) this.hitAt = Math.max(this.hitAt, at); }

  follow(targetX: number, targetY: number, deltaMs: number, panX = 0, panY = 0, at?: number): void {
    if (this.manual) return;
    const elapsed = Math.max(0, deltaMs);
    this.clock = at ?? this.clock + elapsed;
    const shakeTarget = this.clock - this.hitAt < 200 ? 1 : 0;
    this.shake = Math.fround(this.shake + (shakeTarget - this.shake)
      * (1 - Math.pow(ZOOM_SMOOTHING, Math.fround(elapsed) * 0.06)));
    const amplitude = Math.fround(Math.sin(this.clock * 0.05) * 5 * this.shake);
    const phase = Math.fround(this.clock * 0.01);
    const shakeX = Math.fround(Math.fround(Math.cos(phase)) * amplitude);
    const shakeY = Math.fround(Math.fround(Math.sin(phase)) * amplitude);
    if (!this.initialized) {
      this.initialized = true;
      // The archived camera starts at the world origin and snaps to the first
      // player target; the viewport-relative offset then lives in originX/Y.
      this.x = 0;
      this.y = 0;
    }
    // Recovered `updateCamera`: smoothing += (1 - 0.95^(dt * 0.06)) * (1 - s)
    // and alpha = 1 - (1 - s)^(dt * 0.06). With a controlled player s is 1,
    // which makes every follow step exact.
    const ramp = 1 - Math.pow(FOLLOW_RAMP, elapsed * 0.06);
    this.smoothing = Math.min(1, ramp * (1 - this.smoothing) + this.smoothing);
    const alpha = 1 - Math.pow(1 - this.smoothing, elapsed * 0.06);
    this.x = Math.fround(this.x + (Math.fround(Math.fround(targetX + panX) + shakeX) - this.x) * alpha);
    this.y = Math.fround(this.y + (Math.fround(Math.fround(targetY + panY) + shakeY) - this.y) * alpha);
    // The scale relaxes independently; 0.8 is the archived constant.
    const zoomAlpha = 1 - Math.pow(ZOOM_SMOOTHING, elapsed * 0.06);
    if (elapsed > 0) {
      this.pinnedZoom = undefined;
      this.scale = Math.fround(this.scale + (Math.fround(PLAYER_SCALE) - this.scale) * zoomAlpha);
    }
  }

  /** Pin the camera for a recorded comparison; `follow` becomes a no-op. */
  setCamera(x: number, y: number, zoom?: number, entityOffsetX = 0, entityOffsetY = 0): void {
    this.x = x;
    this.y = y;
    this.entityOffsetX = entityOffsetX;
    this.entityOffsetY = entityOffsetY;
    if (zoom !== undefined) this.zoom = zoom;
    this.initialized = true;
    this.smoothing = 1;
    this.manual = true;
  }

  clearOverride(): void {
    this.manual = false;
  }

  getCamera(): CameraProjection {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }

  /** Screen origin in world units for the current viewport. */
  get originX(): number { return this.x - this.viewportWidth / (2 * this.zoom); }
  get originY(): number { return this.y - this.viewportHeight / (2 * this.zoom); }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return { x: this.originX + screenX / this.zoom, y: this.originY + screenY / this.zoom };
  }
}
