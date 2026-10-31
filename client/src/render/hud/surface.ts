import { renderResources } from '../resources.js';
import { wrapContext } from '../canvas2d/context.js';
import type { RasterContext2D } from '../canvas2d/text-cache.js';
import { canvasAvailable, createRasterCanvas, getRasterContext } from '../canvas2d/text-cache.js';
import { HudContext, hudRenderer } from '../canvas2d/transform-context.js';
export function wrapHudSurface(native: RasterContext2D): HudContext {
  // Reuse the shared adapter's RGB lookup, avoiding temporary arrays and
  // hexadecimal string conversion on every HUD color setter.
  const bridge = {
    ...wrapContext(native),
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
