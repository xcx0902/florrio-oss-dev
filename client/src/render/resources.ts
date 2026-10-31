import type { Canvas2DContext } from './canvas2d/context.js';
import type { CachedLabel, RasterCanvas, RasterContext2D } from './canvas2d/text-cache.js';
import type { HudContext } from './canvas2d/transform-context.js';
import type { SpeciesPath } from './art/geometry.js';
import type { MenuAnimation } from './menu-animation.js';
/** One synchronous renderer owns every retained canvas, path and label. */
export class RenderResources {
  labels = new Map<string, CachedLabel>();
  ownedLabels = new Map<string | number, {
    readonly signature: string;
    readonly rasterScale: number;
    readonly canvas: RasterCanvas;
    readonly label: CachedLabel;
  }>();
  measurements = new Map<string, number>();
  measureContext: RasterContext2D | null | undefined;
  canvasSupport: boolean | undefined;
  hudSurface: {
    canvas: RasterCanvas;
    context: HudContext;
  } | undefined;
  panelSurface: {
    canvas: RasterCanvas;
    key: string;
  } | undefined;
  mapBorder: Path2D | undefined;
  ladybugPaths = new WeakMap<Canvas2DContext, SpeciesPath>();
  rockPathCache = new WeakMap<Canvas2DContext, Map<string, SpeciesPath>>();
  cactusPathCache = new WeakMap<Canvas2DContext, Map<number, {
    outer: SpeciesPath;
    inset: SpeciesPath;
  }>>();
  dropLabelOwners = new WeakMap<object, string>();
  nextDropLabelOwner = 0;
  animation: MenuAnimation | undefined;
  preview: {
    context: Canvas2DContext;
  } | undefined;
  previewStates = new WeakMap<Canvas2DContext, {
    at: number;
    amount: number;
  }>();
  dispose(): void {
    this.labels.clear();
    this.ownedLabels.clear();
    this.measurements.clear();
    for (const canvas of [this.hudSurface?.canvas, this.panelSurface?.canvas]) {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    this.measureContext = undefined;
    this.canvasSupport = undefined;
    this.hudSurface = undefined;
    this.panelSurface = undefined;
    this.mapBorder = undefined;
    this.ladybugPaths = new WeakMap();
    this.rockPathCache = new WeakMap();
    this.cactusPathCache = new WeakMap();
    this.dropLabelOwners = new WeakMap();
    this.nextDropLabelOwner = 0;
    this.animation = undefined;
    this.preview = undefined;
    this.previewStates = new WeakMap();
  }
}
/** Explicit owner for standalone artwork callers. Apps always select their own. */
export const standaloneResources = new RenderResources();
let selected: RenderResources = standaloneResources;
export function renderResources(): RenderResources { return selected; }
/** Drawing is synchronous; finally restores the parent for nested renderers. */
export function withRenderResources<T>(resources: RenderResources, draw: () => T): T {
  const previous = selected;
  selected = resources;
  try {
    return draw();
  }
  finally {
    selected = previous;
  }
}
