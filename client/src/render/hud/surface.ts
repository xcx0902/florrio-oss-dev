import { renderResources } from '../resources.js';
import { wrapContext } from '../canvas2d/context.js';
import type { RasterContext2D } from '../canvas2d/text-cache.js';
import { canvasAvailable, createRasterCanvas, getRasterContext } from '../canvas2d/text-cache.js';
import { HudContext, hudRenderer } from '../canvas2d/transform-context.js';
export function wrapHudSurface(native: RasterContext2D): HudContext {
  // These native operations also work until the shared context adapter grows
  // the optional path/composite methods used by the original HUD.
  const bridge = {
    ...wrapContext(native),
    setFillRgb(r: number, g: number, b: number) {
      native.fillStyle = `#${[r, g, b].map(value => (value & 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    },
    setStrokeRgb(r: number, g: number, b: number) {
      native.strokeStyle = `#${[r, g, b].map(value => (value & 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    },
    stroke(path?: Path2D) { if (path)
      native.stroke(path);
    else
      native.stroke(); },
    setGlobalCompositeOperation(operation: GlobalCompositeOperation) { native.globalCompositeOperation = operation; },
  };
  return hudRenderer(bridge);
}
export function getHudSurface(width: number, height: number): ReturnType<typeof renderResources>['hudSurface'] {
  const resources = renderResources();
  if (!canvasAvailable())
    return undefined;
  if (resources.hudSurface && resources.hudSurface.canvas.width === width && resources.hudSurface.canvas.height === height)
    return resources.hudSurface;
  const canvas = createRasterCanvas(width, height);
  if (!canvas)
    return undefined;
  const native = getRasterContext(canvas);
  if (!native)
    return undefined;
  resources.hudSurface = { canvas, context: wrapHudSurface(native) };
  return resources.hudSurface;
}
