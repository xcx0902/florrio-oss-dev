import { renderResources } from '../resources.js';
/** Reimplementation of the archived client's outlined-text cache.
 *
 * The renderer rasterizes every label once into an offscreen canvas at a
 * multiple of the logical font size (`projectedScale = 2.4 * max(|a|,|b|,|c|,|d|)`
 * of the active Canvas2D transform), then draws that canvas through
 * `drawImage(canvas, 0, 0, 1, 1)` with a unit-scale transform. The cached
 * bitmap is therefore downsampled on screen, which is what produced the
 * characteristic soft glyph edges in the golden screenshots.
 *
 * The cache width/height formulas below mirror the recovered wasm text module
 * (`rasterizeLabel` / `drawTextLabel`):
 *   height = trunc(fontPixels * 1.4)
 *   width  = trunc(measure(text @ fontPixels) + 2 * rasterScale * trunc(2 * outline))
 * The label itself is centred in that bitmap at (width / 2, height / 2).
 *
 * Node-based unit tests have no DOM, so the helpers fall back to plain
 * fillText/strokeText with the same font size and outline; layout commands
 * stay identical.
 */
import type { Canvas2DContext } from './context.js';

export interface LabelSpec {
  readonly text: string;
  /** Logical font size in UI/screen units (before the current transform). */
  readonly font: number;
  /** Offscreen raster scale; 1.68 == 2.4 * the archived 0.7 UI transform. */
  readonly rasterScale: number;
  /** f32(2 * max(abs(a,b,c,d))) before the 1.2 raster oversampling margin.
   * Supplying it preserves native hysteresis at adjacent-f32 boundaries. */
  readonly projectedScale?: number;
  /** Outline width as a fraction of the font size (original: 0.12). */
  readonly outline?: number;
  readonly fill?: string;
  readonly stroke?: string;
  /** Force the cached bitmap width (used where the original cache predates a layout change). */
  readonly cacheWidth?: number;
  /** Native label owner, retaining its bitmap across supported scale changes. */
  readonly cacheKey?: string | number;
}

export interface CachedLabel {
  readonly canvas: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  /** Measured text width at the logical font size. */
  readonly textWidth: number;
  /** Bitmap box width at the logical size (text + outline margins). */
  readonly boxWidth: number;
  readonly margin: number;
}

const DEFAULT_OUTLINE = 0.12;
export type RasterCanvas = HTMLCanvasElement | OffscreenCanvas;
export type RasterContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Native bridge allocates OffscreenCanvas when supported, with a DOM fallback. */
export function createRasterCanvas(width: number, height: number): RasterCanvas | undefined {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(width, height); } catch { /* try the DOM bridge */ }
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

/** Narrow before selecting the overloaded DOM/Offscreen getContext API. */
export function getRasterContext(canvas: RasterCanvas): RasterContext2D | null {
  if ('convertToBlob' in canvas) return canvas.getContext('2d');
  return canvas.getContext('2d');
}

/** Release one owner's retained bitmap, returning whether it existed. */
export function releaseLabel(cacheKey: string | number): boolean {
  return renderResources().ownedLabels.delete(cacheKey);
}

export function canvasAvailable(): boolean {
  if (renderResources().canvasSupport !== undefined) return renderResources().canvasSupport ?? false;
  try {
    const canvas = createRasterCanvas(1, 1);
    renderResources().canvasSupport = !!canvas && !!getRasterContext(canvas);
  }
  catch { renderResources().canvasSupport = false; }
  return renderResources().canvasSupport ?? false;
}

function measuringContext(): RasterContext2D | null {
  if (renderResources().measureContext !== undefined) return renderResources().measureContext ?? null;
  renderResources().measureContext = null;
  if (!canvasAvailable()) return null;
  const canvas = createRasterCanvas(8, 8);
  renderResources().measureContext = canvas ? getRasterContext(canvas) : null;
  return renderResources().measureContext ?? null;
}

/** Quantize like the archived host: `(2048 * size | 0) / 2048`. */
function quantizeFont(size: number): number {
  return Math.trunc(size * 2048) / 2048;
}

/** Keep the host's f64 width for func444's bitmap allocation. func385 rounds
 * that same measurement to f32 only when exposing a logical label width. */
function measureNative(text: string, font: number): number {
  const key = `${text}\u0000${quantizeFont(font)}`;
  const cached = renderResources().measurements.get(key);
  if (cached !== undefined) return cached;
  const context = measuringContext();
  if (!context) return 0;
  context.font = `${quantizeFont(font)}px Ubuntu`;
  const width = context.measureText(text).width;
  renderResources().measurements.set(key, width);
  return width;
}

/** Width of `text` at `font` px in the Ubuntu face. */
export function measureLabel(text: string, font: number): number {
  return Math.fround(measureNative(text, font));
}

/** Cached outlined label bitmap. Returns null without a canvas implementation. */
export function getLabel(spec: LabelSpec): CachedLabel | null {
  if (!spec.text || !canvasAvailable()) return null;
  const outline = spec.outline ?? DEFAULT_OUTLINE;
  const fill = spec.fill ?? '#FFFFFF';
  const stroke = spec.stroke ?? '#000000';
  const owned = spec.cacheKey === undefined ? undefined : renderResources().ownedLabels.get(spec.cacheKey);
  let key: string | undefined;
  if (spec.cacheKey !== undefined) {
    // func444 compares the projected (2 * transform) scale with the stored
    // raster scale (projected * 1.2), before adding the oversampling margin.
    // A content/style change dirties this owner even if an older bitmap with
    // the requested string happens to exist elsewhere in the cache.
    const projected = Math.fround(spec.projectedScale ?? spec.rasterScale / 1.2);
    const ratio = owned && Math.fround(projected / owned.rasterScale);
    const style = owned?.style;
    if (style?.text === spec.text && style.font === spec.font && style.outline === outline
        && style.fill === fill && style.stroke === stroke && style.cacheWidth === spec.cacheWidth
        && ratio !== undefined && ratio <= 1.0001 && ratio >= 0.4) return owned!.label;
  } else {
    key = `${spec.text}\u0000${spec.font}\u0000${outline}\u0000${fill}\u0000${stroke}\u0000${spec.cacheWidth ?? ''}\u0000${spec.rasterScale}`;
    const cached = renderResources().labels.get(key);
    if (cached) return cached;
  }

  // The renderer stores the unquantized font/scale in f32. Only the host's
  // CSS font string is quantized; bitmap dimensions use the raster value.
  const fontPixels = Math.fround(Math.fround(spec.font) * Math.fround(spec.rasterScale));
  const margin = Math.trunc(Math.fround(Math.fround(spec.font * outline) * 2));
  const textWidth = measureLabel(spec.text, spec.font);
  const rasterWidth = measureNative(spec.text, fontPixels);
  const pixelMargin = Math.fround(Math.fround(spec.rasterScale) * margin);
  const width = Math.max(1, spec.cacheWidth ?? Math.trunc(rasterWidth + Math.fround(pixelMargin + pixelMargin)));
  const height = Math.max(1, Math.trunc(fontPixels * 1.4));

  const resources = renderResources();
  if (width > resources.budgets.maxRasterDimension || height > resources.budgets.maxRasterDimension
      || width * height * 4 > resources.budgets.rasterBytes) {
    if (spec.cacheKey !== undefined) releaseLabel(spec.cacheKey);
    return null; // direct text fallback retains font, outline and logical size
  }
  const canvas = owned?.canvas ?? createRasterCanvas(width, height);
  if (!canvas) return null;
  if (owned) { canvas.width = width; canvas.height = height; }
  const context = getRasterContext(canvas);
  if (!context) return null;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${quantizeFont(fontPixels)}px Ubuntu`;
  context.lineWidth = Math.fround(fontPixels * outline);
  context.strokeStyle = stroke;
  context.fillStyle = fill;
  // The archived text module centres on integer canvas coordinates
  // (`floor(width / 2)`), not on the fractional midpoint; that half-pixel
  // decides the glyph antialiasing and is required for pixel parity.
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  if (outline > 0) context.strokeText(spec.text, centerX, centerY);
  context.fillText(spec.text, centerX, centerY);

  const label: CachedLabel = {
    canvas,
    width,
    height,
    textWidth,
    boxWidth: textWidth + margin * 2,
    margin,
  };
  if (spec.cacheKey !== undefined) {
    renderResources().ownedLabels.set(spec.cacheKey, {
      style: { text: spec.text, font: spec.font, outline, fill, stroke, cacheWidth: spec.cacheWidth },
      rasterScale: Math.fround(spec.rasterScale), canvas, label,
    });
  } else renderResources().labels.set(key!, label);
  return label;
}

function fallback(context: Canvas2DContext, spec: LabelSpec, centerX: number,
                  centerY: number, scale: number): void {
  const outline = spec.outline ?? DEFAULT_OUTLINE;
  const size = spec.font * scale;
  context.setFont(`${size}px Ubuntu`);
  context.setLineWidth(size * outline);
  const color = (hex: string): [number, number, number] => {
    const value = Number.parseInt(hex.replace(/^#/, ''), 16);
    return [value >>> 16 & 255, value >>> 8 & 255, value & 255];
  };
  context.setStrokeRgb(...color(spec.stroke ?? '#000000'));
  context.setFillRgb(...color(spec.fill ?? '#FFFFFF'));
  if (outline > 0) context.strokeText(spec.text, centerX, centerY);
  context.fillText(spec.text, centerX, centerY);
}

interface Affine { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number; }

function currentTransform(context: Canvas2DContext): Affine {
  const source = context as unknown as { getTransform?: () => Affine | readonly number[] };
  if (typeof source.getTransform === 'function') {
    try {
      const value = source.getTransform();
      const matrix = Array.isArray(value)
        ? { a: value[0], b: value[1], c: value[2], d: value[3], e: value[4], f: value[5] }
        : value as Affine;
      if (matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) return matrix;
    } catch { /* fall through */ }
  }
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** Draw the cached bitmap exactly like a cached canvas draw: a
 * unit image through a composed transform (not the 5-argument drawImage
 * form). Chrome takes the same filtering path for both clients this way. */
function drawUnitImage(context: Canvas2DContext, image: CanvasImageSource,
                       x: number, y: number, width: number, height: number,
                       preserveState: boolean): void {
  const m = currentTransform(context);
  const f = Math.fround;
  if (preserveState) context.save();
  context.setTransform(
    f(f(m.a) * f(width)), f(f(m.b) * f(width)),
    f(f(m.c) * f(height)), f(f(m.d) * f(height)),
    f(f(m.e) + f(f(f(m.a) * f(x)) + f(f(m.c) * f(y)))),
    f(f(m.f) + f(f(f(m.b) * f(x)) + f(f(m.d) * f(y)))),
  );
  context.drawImage(image, 0, 0, 1, 1);
  if (preserveState) context.restore();
  else context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}

/** Draw a label centred at (centerX, centerY), scaled by `scale`. */
export function drawLabel(context: Canvas2DContext, spec: LabelSpec,
                         centerX: number, centerY: number, scale = 1,
                         preserveState = true): void {
  if (!spec.text) return;
  const label = getLabel(spec);
  if (!label) {
    fallback(context, spec, centerX, centerY, scale);
    return;
  }
  const f = Math.fround;
  const width = f(f(label.boxWidth) * f(scale));
  const height = f(f(spec.font * 1.4) * f(scale));
  drawUnitImage(context, label.canvas, f(f(centerX) - f(width * 0.5)),
    f(f(centerY) - f(height * 0.5)), width, height, preserveState);
}

/** Draw a label into an exact bitmap box (dest rect in current transform space). */
export function drawLabelBox(context: Canvas2DContext, spec: LabelSpec,
                            x: number, y: number, width: number, height: number,
                            preserveState = true): void {
  if (!spec.text) return;
  const label = getLabel(spec);
  if (!label) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    fallback(context, spec, centerX, centerY, height / (spec.font * 1.4));
    return;
  }
  drawUnitImage(context, label.canvas, x, y, width, height, preserveState);
}

/** Clear all cached bitmaps (tests / font reloads). */
export function clearLabelCache(): void {
  renderResources().labels.clear();
  renderResources().ownedLabels.clear();
  renderResources().measurements.clear();
  renderResources().layouts.clear();
  const panel=renderResources().panelSurface;
  if(panel){panel.canvas.width=0;panel.canvas.height=0;}
  renderResources().panelSurface = undefined;
}
