import type { GameApp } from '../app/game-app.js';
export class Transitions {
  entryAt: number | undefined;
  entryCanvas: HTMLCanvasElement | undefined;
  exitAt: number | undefined;
  exitCanvas: HTMLCanvasElement | undefined;
  exitFrame: number;
  constructor(readonly app: GameApp) {
    this.exitFrame = 0;
  }
  captureEntryCanvas = (): void => {
    if (!this.entryCanvas)
      this.entryCanvas = document.createElement('canvas');
    this.entryCanvas.width = this.app.canvas.width;
    this.entryCanvas.height = this.app.canvas.height;
    this.entryCanvas.getContext('2d')?.drawImage(this.app.canvas, 0, 0);
  };
  drawEntryTransition = (now: number): void => {
    const progress = Math.max(0, Math.min(1, (now - (this.entryAt ?? now)) / 420));
    const width = this.app.canvas.width, height = this.app.canvas.height;
    const radius = 20 + progress * progress * Math.hypot(width, height) * 1.15;
    this.app.context2d.save();
    this.app.context2d.setTransform(1, 0, 0, 1, 0, 0);
    const cx = width / 2, cy = height / 2 - 10 * this.app.dpr;
    this.app.context2d.beginPath();
    this.app.context2d.rect(0, 0, width, height);
    this.app.context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
    this.app.context2d.fillStyle = '#1EA761';
    this.app.context2d.fill('evenodd');
    if (this.entryCanvas) {
      // The menu is visible only outside the iris: the garden is revealed
      // through the hole, exactly like the native transition.
      this.app.context2d.save();
      this.app.context2d.beginPath();
      this.app.context2d.rect(0, 0, width, height);
      this.app.context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
      this.app.context2d.clip('evenodd');
      this.app.context2d.drawImage(this.entryCanvas, 0, 0);
      this.app.context2d.restore();
    }
    this.app.context2d.beginPath();
    this.app.context2d.arc(cx, cy, radius, 0, Math.PI * 2);
    this.app.context2d.strokeStyle = '#000';
    this.app.context2d.lineWidth = Math.max(2, 6 * this.app.dpr);
    this.app.context2d.stroke();
    this.app.context2d.restore();
    if (progress >= 1) {
      this.entryAt = undefined;
      this.entryCanvas = undefined;
    }
  };
  drawExitTransition = (): void => {
    // The menu iris: a cubic ease over 62.5 rendered frames in the
    // menu's logical space, never wall-clock time. The black band shrinks with
    // the same progress after the first 41 frames.
    const width = this.app.canvas.clientWidth, height = this.app.canvas.clientHeight;
    if (width <= 0 || height <= 0) {
      this.exitAt = undefined;
      this.exitCanvas = undefined;
      return;
    }
    const scale = Math.fround(Math.max(0.7, Math.fround(Math.max(width * 0.000521, height * 0.000926))));
    const ui = Math.fround(scale * this.app.dpr);
    const logicalWidth = Math.ceil(Math.fround(width / scale));
    const logicalHeight = Math.ceil(Math.fround(height / scale));
    const cx = logicalWidth * 0.5, cy = logicalHeight * 0.5;
    this.exitFrame += 1;
    const remaining = 1 - this.exitFrame / 62.5;
    if (remaining <= 0) {
      this.exitAt = undefined;
      this.exitCanvas = undefined;
      return;
    }
    const radius = Math.fround(Math.hypot(logicalWidth, logicalHeight) * 0.5
      * Math.pow(remaining, 3));
    this.app.context2d.save();
    this.app.context2d.beginPath();
    this.app.context2d.setTransform(ui, 0, 0, ui, 0, 0);
    this.app.context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
    this.app.context2d.clip();
    this.app.context2d.setTransform(ui * logicalWidth, 0, 0, ui * logicalHeight, 0, 0);
    if (this.exitCanvas)
      this.app.context2d.drawImage(this.exitCanvas, 0, 0, 1, 1);
    this.app.context2d.restore();
    // The menu is painted clipped *outside* the iris and then fills a
    // black band around the circle. Its width is 5 for the first 41 frames and
    // then shrinks to 0.12 as the iris closes; our menu is already on screen, so
    // paint the equivalent band as an annulus. Filling the outer circle while
    // the inner clip is active would hide the captured death frame entirely.
    const band = Math.min(5, 15 * remaining);
    this.app.context2d.save();
    this.app.context2d.setTransform(ui, 0, 0, ui, 0, 0);
    this.app.context2d.beginPath();
    this.app.context2d.arc(cx, cy, radius + band, 0, Math.PI * 2);
    this.app.context2d.arc(cx, cy, radius, 0, Math.PI * 2, true);
    this.app.context2d.fillStyle = '#000';
    this.app.context2d.fill();
    this.app.context2d.restore();
  };
  dispose(): void { this.entryCanvas = this.exitCanvas = undefined; this.entryAt = this.exitAt = undefined; this.exitFrame = 0; }
}
