import { ResourceCache, CacheBudget, DEFAULT_RENDER_BUDGETS } from './resource-cache.js';
import type { Canvas2DContext } from './canvas2d/context.js';
import type { CachedLabel, LabelSpec, RasterCanvas, RasterContext2D } from './canvas2d/text-cache.js';
import type { HudContext } from './canvas2d/transform-context.js';
import type { SpeciesPath } from './art/geometry.js';
import type { MenuAnimation } from './menu-animation.js';
interface OwnedLabel {
  readonly style: Pick<LabelSpec, 'text' | 'font' | 'outline' | 'fill' | 'stroke' | 'cacheWidth'>;
  readonly rasterScale:number;
  readonly canvas:RasterCanvas; readonly label:CachedLabel;
}
/** One synchronous renderer owns every retained canvas, path and label. */
export class RenderResources {
  readonly budgets: typeof DEFAULT_RENDER_BUDGETS;
  readonly rasterBudget: CacheBudget;
  readonly pathBudget: CacheBudget;
  readonly labels: ResourceCache<string,CachedLabel>;
  readonly ownedLabels: ResourceCache<string | number,OwnedLabel>;
  readonly measurements: ResourceCache<string,number>;
  readonly layouts: ResourceCache<string,unknown>;
  constructor(budgets: Partial<{ [K in keyof typeof DEFAULT_RENDER_BUDGETS]: number }> = {}) {
    this.budgets = { ...DEFAULT_RENDER_BUDGETS, ...budgets } as typeof DEFAULT_RENDER_BUDGETS;
    for(const value of Object.values(this.budgets))if(!Number.isSafeInteger(value)||value<1)throw new Error('Render budgets must be positive integers');
    this.rasterBudget = new CacheBudget(this.budgets.rasterBytes);
    this.pathBudget = new CacheBudget(this.budgets.paths);
    const release = (label:CachedLabel):void => { (label.canvas as RasterCanvas).width=0;(label.canvas as RasterCanvas).height=0; };
    this.labels = new ResourceCache(this.budgets.labels,label=>label.width*label.height*4,this.rasterBudget,release);
    this.ownedLabels = new ResourceCache(this.budgets.owners,owner=>owner.label.width*owner.label.height*4,this.rasterBudget,owner=>release(owner.label));
    this.measurements = new ResourceCache(this.budgets.measurements);
    this.layouts = new ResourceCache(this.budgets.layouts);
  }
  snapshot() { return { labels:this.labels.size,owners:this.ownedLabels.size,measurements:this.measurements.size,layouts:this.layouts.size,rasterBytes:this.rasterBudget.bytes,paths:this.pathBudget.bytes,
    hits:this.labels.hits+this.ownedLabels.hits+this.measurements.hits,misses:this.labels.misses+this.ownedLabels.misses+this.measurements.misses,
    evictions:this.labels.evictions+this.ownedLabels.evictions+this.measurements.evictions }; }
  /* owned label shape declared above */
  measureContext: RasterContext2D | null | undefined;
  canvasSupport: boolean | undefined;
  hudSurface: {
    canvas: RasterCanvas;
    context: HudContext;
  } | undefined;
  panelSurface: {
    canvas: RasterCanvas;
    rows: readonly (readonly [string, boolean | undefined, string, number])[];
    ratio: number; scale: number;
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
    this.layouts.clear();
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
    for(const cache of this.pathBudget.caches)cache.clear();
    this.pathBudget.caches.clear();
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
