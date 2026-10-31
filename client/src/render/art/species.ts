import { renderResources } from '../resources.js';
import type { Canvas2DContext } from '../canvas2d/context.js';
import { SpeciesContext, SpeciesPath, artRandom, disc, f32, fillArtRectangle, finiteTime, inLocal, localContext, positiveRadius, style } from './geometry.js';
import { PALETTES, Rgb, TAU, flashColor, rgb, setFill, setStroke, shade } from './palette.js';
/** Component96 consumes three independent minstd_rand values per spot. */
export function ladybugSpots(handle: number, radius = 30): readonly (readonly [
  number,
  number,
  number
])[] {
  const next = artRandom(handle);
  return Array.from({ length: radius > 30 ? 5 : 3 }, () => [
    f32(f32(f32(next() - 1) * (50 / 2147483648)) - 25),
    f32(f32(f32(next() - 1) * (50 / 2147483648)) - 25),
    f32(f32(f32(next() - 1) * (7 / 2147483648)) + 3),
  ] as const);
}
export function traceLadybugBody(path: SpeciesPath): void {
  // Native static path constants, including the f32 -> f64 promotion.
  path.arc(0, 0, 30, 0.6000000238418579, 5.683185283337728, false);
  path.quadraticCurveTo(10, 0, 24.760068893432617, 16.939273834228516);
  path.closePath();
}
export function usePath(context: Canvas2DContext, path: SpeciesPath | undefined, trace: (path: SpeciesPath) => void, operation: 'fill' | 'stroke' | 'clip'): void {
  if (path)
    (context[operation] as (path: SpeciesPath) => void)(path);
  else {
    context.beginPath();
    trace(context);
    context[operation]();
  }
}
/** Component96: red, dark red and yellow shells; massive uses radius/30 and
* five spots. Outlines shade the flashed fill instead of flashing the rim. */
export function drawLadybug(context: Canvas2DContext, handle: number, flash = 0, radius = 30, species = 4): void {
  const resources = renderResources();
  radius = positiveRadius(radius, 30);
  context = localContext(context, f32(radius / 30));
  const dark = flashGrey(17, flash);
  const body = flashColor(species === 20 ? rgb(150, 41, 33) : species === 21 ? rgb(235, 235, 52) : PALETTES.ladybugBody, flash);
  const spots = flashColor(species === 20 ? rgb(190, 52, 42) : PALETTES.ladybugDark, flash);
  context.setLineWidth(7);
  context.setLineJoin('round');
  style(context, dark);
  disc(context, 15, 0, 15);
  style(context, body);
  let path = resources.ladybugPaths.get(context);
  if (!path && (context as SpeciesContext).createPath) {
    path = (context as SpeciesContext).createPath!();
    traceLadybugBody(path);
    resources.ladybugPaths.set(context, path);
  }
  usePath(context, path, traceLadybugBody, 'fill');
  context.save();
  usePath(context, path, traceLadybugBody, 'clip');
  style(context, spots);
  for (const [x, y, r] of ladybugSpots(handle, radius))
    disc(context, x, y, r, false);
  context.restore();
  usePath(context, path, traceLadybugBody, 'stroke');
}
/** Native constant-grey palettes fold their remainder to base - weight * base.
* Reassociating it as (1 - weight) * base changes truncated f32 colours. */
export function flashGrey(base: number, flash: number): Rgb {
  if (!(flash > 0))
    return rgb(base, base, base);
  const weight = f32(Math.min(1, flash)), remainder = f32(base - f32(weight * base));
  const red = Math.trunc(f32(f32(weight * 255) + remainder));
  const other = Math.trunc(f32(remainder + f32(weight * (weight >= 0.9 ? 255 : 0))));
  return rgb(red, other, other);
}
export function drawStripedBug(context: Canvas2DContext, flash: number, hornet: boolean): void {
  const dark = flashGrey(51, flash);
  // Native1040/1044 keep the yellow body's red channel at a constant 255.
  const body = { ...flashColor(hornet ? PALETTES.hornetBody : PALETTES.beeBody, flash), r: 255 };
  const outline = flashColor(hornet ? PALETTES.hornetOutline : PALETTES.beeOutline, flash);
  context.setLineWidth(5);
  context.setLineJoin('round');
  context.setLineCap('round');
  setFill(context, dark);
  setStroke(context, hornet ? dark : shade(dark));
  context.beginPath();
  context.moveTo(hornet ? -47 : -37, 0);
  context.lineTo(-25, hornet ? -6 : -9);
  context.lineTo(-25, hornet ? 6 : 9);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.ellipse(0, 0, 30, 20, 0, 0, TAU);
  setFill(context, body);
  context.fill();
  context.save();
  context.clip();
  setFill(context, dark);
  // Warning rectangles are drawn from right to left.
  const native = context as SpeciesContext;
  if (native.transform && !native.getTransform) {
    // Legacy bridges cannot restore a logical matrix without a Canvas save.
    // Keep their previous trace structure; exact native410 f32 composition
    // requires the read-only logical-matrix hook above.
    native.transform(10, 0, 0, 40, 10, -20);
    context.fillRect(0, 0, 1, 1);
    native.transform(1, 0, 0, 1, -2, 0);
    context.fillRect(0, 0, 1, 1);
    native.transform(1, 0, 0, 1, -2, 0);
    context.fillRect(0, 0, 1, 1);
  }
  else
    for (const x of [10, -10, -30])
      fillArtRectangle(context, x, -20, 10, 40);
  context.restore();
  context.beginPath();
  context.ellipse(0, 0, 30, 20, 0, 0, TAU);
  setStroke(context, outline);
  context.stroke();
  setStroke(context, dark);
  setFill(context, dark);
  context.setLineWidth(3);
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(25, side * 5);
    context.quadraticCurveTo(hornet ? 40 : 35, side * (hornet ? 10 : 5), hornet ? 50 : 40, side * 15);
    if (hornet) {
      context.quadraticCurveTo(40, side * 5, 25, side * 5);
      context.closePath();
      context.fill();
      context.stroke();
    }
    else {
      context.stroke();
      disc(context, 40, side * 15, 5, false);
    }
  }
}
export function drawBee(context: Canvas2DContext, flash = 0): void { drawStripedBug(context, flash, false); }
/** Component132 applies its own scale(1.3), irrespective of the wire radius. */
export function drawHornet(context: Canvas2DContext, flash = 0): void {
  drawStripedBug(localContext(context, 1.2999999523162842), flash, true);
}
/** Time at rest follows the original slow cosine; movement uses the fast
* cosine. Motion input is optional because drawSpecies's six-argument API
* cannot infer displacement or attack flags from a wire handle. */
export function insectWave(now: number, activity = 0): number {
  const time = finiteTime(now);
  const slow = f32(0.5 - Math.cos(time * 0.01) * 0.5);
  const fast = f32(0.5 - Math.cos(time * 0.03) * 0.5);
  return f32(Math.max(0, Math.min(1, activity)) * (fast - slow) + slow);
}
export function antWings(context: Canvas2DContext, now: number, size: number, flash: number, activity: number): void {
  inLocal(context, wingContext => {
    wingContext.setGlobalAlpha(((wingContext as SpeciesContext).getGlobalAlpha?.() ?? 1) * 0.5);
    const light = flashGrey(238, flash);
    setFill(wingContext, light);
    setStroke(wingContext, light);
    const wave = insectWave(now, activity);
    for (const side of [-1, 1]) {
      inLocal(wingContext, wing => {
        wing.beginPath();
        wing.ellipse(-7, side * 8, 15, 7, -side * f32(Math.PI / 10), 0, TAU);
        wing.fill();
      }, size, side * wave * Math.PI / 10);
    }
  });
}
/** Components84 / 676 / 779 / 1037: all ants share grey palettes. Body
* radii/offsets are component geometry, not each species' collision radius. */
export function drawAnt(context: Canvas2DContext, _handle: number, _radius = 14, species = 7, now = 0, flash = 0, activity = 0): void {
  context.setLineWidth(7);
  context.setLineJoin('round');
  context.setLineCap('round');
  const body = flashGrey(85, flash);
  const stage = species - 7;
  if (stage === 1 || stage === 2) {
    style(context, body);
    disc(context, -8, 0, 10);
  }
  if (stage === 3) {
    style(context, body);
    disc(context, -25, 0, 30);
    style(context, body);
    disc(context, 0, 0, 25);
  }
  if (stage >= 2)
    antWings(context, now, stage === 3 ? 2 : 1, flash, activity);
  const headX = stage === 3 ? 25 : stage > 0 ? 8 : 0;
  const size = stage === 3 ? 1.5 : 1;
  const head = localContext(context, 1, 0, headX, 0);
  setStroke(head, shade(flashGrey(51, flash)));
  const wave = insectWave(now, activity), endY = f32(5 - wave), controlY = f32(10 - wave);
  for (const side of [-1, 1]) {
    head.beginPath();
    head.moveTo(0, side * f32(size * 7));
    head.quadraticCurveTo(f32(size * 11), side * f32(size * controlY), f32(size * 22), side * f32(size * endY));
    head.stroke();
  }
  style(head, body);
  disc(head, 0, 0, f32(size * 14));
}
/** Component60: two canonical uniform doubles per vertex, four RNG samples.
* Keep f32 trig and multiplication boundaries from native785. */
export function rockPoints(handle: number, radius: number, vertices?: number): readonly (readonly [
  number,
  number
])[] {
  const next = artRandom(handle);
  const jitter = (): number => {
    const low = next() - 1, high = next() - 1;
    return (high * 2147483646 + low) * 4.336808698019955e-20 + 0.85;
  };
  radius = positiveRadius(radius, 25);
  const count = vertices ?? Math.trunc(radius / 7 + 3);
  const points: [
    number,
    number
  ][] = [];
  for (let index = 0; index < count; index++) {
    const angle = f32(index * TAU / count), xJitter = jitter(), yJitter = jitter();
    points.push([f32(xJitter * f32(radius * f32(Math.cos(angle)))), f32(yJitter * f32(radius * f32(Math.sin(angle))))]);
  }
  return points;
}
// Native785 stores a Path2D in component60 +8, built once from seed/radius.
// Intern procedural geometry per context with a bounded cache; no captured
// entity identities or paint commands are used as artwork fixtures.
export function drawRock(context: Canvas2DContext, handle: number, radius: number, flash = 0): void {
  const resources = renderResources();
  const native = context as SpeciesContext;
  radius = positiveRadius(radius, 25);
  const seed = (((handle >>> 0) & 0x3fff) ^ ((handle >>> 0) >>> 14)) % 2147483647 || 1;
  const key = `${seed}:${radius}`;
  let path = resources.rockPathCache.get(context)?.get(key);
  if (!path && native.createPath) {
    path = native.createPath();
    rockPoints(handle, radius).forEach(([x, y], index) => {
      if (index)
        path!.lineTo(x, y);
      else
        path!.moveTo(x, y);
    });
    path.closePath();
    let cache = resources.rockPathCache.get(context);
    if (!cache) {
      cache = new Map();
      resources.rockPathCache.set(context, cache);
    }
    if (cache.size >= 128)
      cache.delete(cache.keys().next().value!);
    cache.set(key, path);
  }
  context.setLineWidth(7);
  context.setLineJoin('round');
  style(context, flashGrey(119, flash));
  if (path) {
    context.fill(path as Path2D);
    context.stroke(path as Path2D);
  }
  else {
    context.beginPath();
    rockPoints(handle, radius).forEach(([x, y], index) => { if (index)
      context.lineTo(x, y);
    else
      context.moveTo(x, y); });
    context.closePath();
    context.fill();
    context.stroke();
  }
}
/** Component128: rounded polygon with a dark, miter-joined inset star. */
export function cactusPaths(radius: number): {
  outer: (path: SpeciesPath) => void;
  inset: (path: SpeciesPath) => void;
} {
  radius = positiveRadius(radius, 50);
  const count = Math.trunc(radius / 7 + 3);
  const point = (i: number): [
    number,
    number
  ] => {
    const angle = f32(i * TAU * (1 / count));
    return [f32(radius * f32(Math.cos(angle))), f32(radius * f32(Math.sin(angle)))];
  };
  return {
    outer(path) {
      path.moveTo(...point(0));
      for (let i = 1; i <= count; i++) {
        const [x, y] = point(i), [px, py] = point(i - 1);
        path.quadraticCurveTo(f32(f32(x + px) * 0.45), f32(f32(y + py) * 0.45), x, y);
      }
      path.closePath();
    },
    inset(path) {
      for (let i = 0; i < count; i++) {
        const [x, y] = point(i), [nx, ny] = point(i + 1);
        if (i)
          path.lineTo(x, y);
        else
          path.moveTo(x, y);
        path.lineTo(f32(f32(x + nx) * 0.25), f32(f32(y + ny) * 0.25));
      }
      path.closePath();
    },
  };
}
export function drawCactus(context: Canvas2DContext, radius: number, _now = 0, flash = 0): void {
  const resources = renderResources();
  radius = positiveRadius(radius, 50);
  const geometry = cactusPaths(radius), native = context as SpeciesContext;
  let cached = resources.cactusPathCache.get(context)?.get(radius);
  if (!cached && native.createPath) {
    cached = { outer: native.createPath(), inset: native.createPath() };
    geometry.outer(cached.outer);
    geometry.inset(cached.inset);
    let cache = resources.cactusPathCache.get(context);
    if (!cache) {
      cache = new Map();
      resources.cactusPathCache.set(context, cache);
    }
    if (cache.size >= 256)
      cache.delete(cache.keys().next().value!);
    cache.set(radius, cached);
  }
  context.setLineWidth(7);
  context.setLineJoin('miter');
  native.setMiterLimit?.(10);
  setStroke(context, shade(flashGrey(51, flash)));
  usePath(context, cached?.inset, geometry.inset, 'stroke');
  context.setLineJoin('round');
  style(context, flashColor(PALETTES.cactusBody, flash));
  usePath(context, cached?.outer, geometry.outer, 'fill');
  usePath(context, cached?.outer, geometry.outer, 'stroke');
}
/** Component88: three filled, concentric soil discs, with no rim. */
export function drawAntHole(context: Canvas2DContext, flash = 0): void {
  context.setLineWidth(7);
  context.setLineJoin('round');
  context.setLineCap('round');
  for (const [radius, color] of [[45, rgb(181, 133, 0)], [30, rgb(148, 109, 0)], [15, rgb(107, 79, 0)]] as const) {
    setFill(context, flashColor(color, flash));
    disc(context, 0, 0, radius, false);
  }
}
/** Component104: animated front mandibles, a purple shell, seam, six spots. */
export function drawBeetle(context: Canvas2DContext, radius = 40, nowOrLegacyColor: number | Rgb = 0, flash = 0, activity = 0): void {
  const now = typeof nowOrLegacyColor === 'number' ? nowOrLegacyColor : 0;
  context = localContext(context, f32(positiveRadius(radius, 40) * 0.025));
  context.setLineCap('round');
  context.setLineJoin('round');
  const dark = flashGrey(51, flash), body = flashColor(rgb(144, 93, 176), flash), outline = shade(body);
  for (const side of [-1, 1]) {
    inLocal(context, mandible => {
      mandible.beginPath();
      mandible.moveTo(-10, side * -15);
      mandible.quadraticCurveTo(15, side * -30, 35, side * -15);
      mandible.quadraticCurveTo(15, side * -20, -10, side * -5);
      mandible.closePath();
      setFill(mandible, dark);
      setStroke(mandible, dark);
      mandible.setLineWidth(7);
      mandible.fill();
      mandible.stroke();
    }, 1, side * 0.2 * insectWave(now, activity), 35, 0);
  }
  context.beginPath();
  context.moveTo(0, -30);
  context.quadraticCurveTo(40, -30, 40, 0);
  context.quadraticCurveTo(40, 30, 0, 30);
  context.quadraticCurveTo(-40, 30, -40, 0);
  context.quadraticCurveTo(-40, -30, 0, -30);
  context.closePath();
  setFill(context, body);
  setStroke(context, outline);
  context.setLineWidth(7);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-20, 0);
  context.quadraticCurveTo(0, -3, 20, 0);
  setStroke(context, outline);
  context.setLineWidth(7);
  context.stroke();
  setFill(context, outline);
  for (const [x, y] of [[-17, -12], [-17, 12], [0, -15], [0, 15], [17, -12], [17, 12]])
    disc(context, x, y, 5, false);
}
/** Component124 represents one segment. Head antennae are present only for
* ids15/17; ownership and world transforms place ids16/18 along the chain. */
export function drawCentipede(context: Canvas2DContext, species: number, flash = 0): void {
  const dark = flashGrey(51, flash);
  const body = flashColor(species === 17 || species === 18 ? rgb(144, 93, 176) : rgb(138, 194, 85), flash);
  context.setLineWidth(7);
  context.setLineJoin('round');
  context.setLineCap('round');
  setFill(context, dark);
  disc(context, 0, -30, 15, false);
  disc(context, 0, 30, 15, false);
  style(context, body);
  disc(context, 0, 0, 35);
  if (species === 16 || species === 18)
    return;
  setStroke(context, dark);
  setFill(context, dark);
  context.setLineWidth(3);
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(25, side * 10);
    context.quadraticCurveTo(45, side * 10, 55, side * 30);
    context.stroke();
    disc(context, 55, side * 30, 5, false);
  }
}
/** Component64's eight quadratic legs. `phase` is accumulated movement (not
* an arbitrary handle hash); use 0 at rest. drawSpecies exposes a stable pose.
* Call drawSpider with accumulated phase when the caller tracks motion. */
export function drawSpider(context: Canvas2DContext, phase = 0, flash = 0): void {
  context.setLineWidth(5);
  context.setLineJoin('round');
  context.setLineCap('round');
  // Native spider legs deliberately do not participate in hit flashing.
  setStroke(context, rgb(51, 51, 51));
  const wavePhase = f32(finiteTime(phase) * 0.015);
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const cosine = f32(Math.cos(f32(wavePhase + f32((side + i) * Math.PI / 2))));
      const wave = f32(0.5 - cosine * 0.5);
      let angle = f32(i * 0.6 - 0.9 + f32(wave + wave - 1) * 0.2);
      if (side === -1)
        angle = f32(-Math.PI - angle);
      const x = f32(f32(Math.sin(angle)) * 35), y = f32(f32(Math.cos(angle)) * 35);
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(x * 0.8, y * 0.5, x, y);
      context.stroke();
    }
  style(context, flashColor(rgb(79, 65, 46), flash));
  disc(context, 0, 0, 15);
}
export function drawSquare(context: Canvas2DContext, flash = 0): void {
  context.setLineWidth(5.249999910593033);
  context.setLineJoin('round');
  style(context, { ...flashColor(rgb(255, 232, 105), flash), r: 255 });
  context.beginPath();
  context.rect(-24.748737335205078, -24.748737335205078, 49.497474670410156, 49.497474670410156);
  context.fill();
  context.stroke();
}
export interface SpeciesAnimation {
  /** Native component64's accumulated, speed-smoothed movement phase. */
  readonly legPhase?: number;
  /** Native components84/104's smoothed active/attack blend, in [0,1]. */
  readonly activity?: number;
}
/** All 23 catalog ids (0=None). Unknown ids draw nothing rather than inventing
* a beetle. Radius is the visual/collision radius from the entity snapshot;
* now is elapsed animation time in ms; flash is remaining blend in [0,1].
* Caller owns rotation, alpha, lifecycle and the outer save/restore. The
* optional seventh argument carries actual motion state when available;
* the required six-argument API has the native resting pose. */
export function drawSpecies(context: Canvas2DContext, species: number, handle: number, radius: number, now: number, flash = 0, animation: SpeciesAnimation = {}): void {
  switch (species) {
    case 0: return;
    case 1:
    case 2:
      drawRock(context, handle, radius, flash);
      return;
    case 3:
      drawCactus(context, radius, now, flash);
      return;
    case 4:
    case 5:
    case 20:
    case 21:
      drawLadybug(context, handle, flash, radius, species);
      return;
    case 6:
      drawBee(context, flash);
      return;
    case 7:
    case 8:
    case 9:
    case 10:
      drawAnt(context, handle, radius, species, now, flash, animation.activity);
      return;
    case 11:
      drawAntHole(context, flash);
      return;
    case 12:
    case 13:
      drawBeetle(context, radius, now, flash, animation.activity);
      return;
    case 14:
      drawHornet(context, flash);
      return;
    case 15:
    case 16:
    case 17:
    case 18:
      drawCentipede(context, species, flash);
      return;
    case 19:
      drawSquare(context, flash);
      return;
    case 22:
      drawSpider(context, animation.legPhase, flash);
      return;
    default: return;
  }
}
