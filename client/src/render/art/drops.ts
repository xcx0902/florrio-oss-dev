import { renderResources } from '../resources.js';
import { PETAL_INFO } from '../../schema/petals.js';
import type { Canvas2DContext } from '../canvas2d/context.js';
import { drawLabel } from '../canvas2d/text-cache.js';
import { fillArtRectangle, inLocal, localContext } from './geometry.js';
import { rgb, setFill, setStroke, shade } from './palette.js';
import { drawPetalIcon } from './petals.js';
const cardColors = new Map<number, { fill:ReturnType<typeof rgb>; stroke:ReturnType<typeof rgb> }>();
function cardColor(rarity:number):{ fill:ReturnType<typeof rgb>; stroke:ReturnType<typeof rgb> } {
  let cached=cardColors.get(rarity);
  if(!cached) {
    const shift=BigInt(rarity*8);
    const fill=rgb(Number(245047318478718n>>shift&255n),Number(34218529646319n>>shift&255n),Number(111187557834093n>>shift&255n));
    cached={fill,stroke:shade(fill)};cardColors.set(rarity,cached);
  }
  return cached;
}
/** Native pickup visual owned by the world marker, separate from its HUD
* transfer. A newly spawned pickup grows/spins in; a scene's existing pickups
* start at full size. The protocol's flags&128 distinguishes those cases. */
export interface DropVisualState {
  progress: number;
  readonly phase: number;
  readonly createdAt: number;
  now: number;
}
export function dropLabelOwner(state: Readonly<DropVisualState>): string {
  const resources = renderResources();
  let owner = resources.dropLabelOwners.get(state);
  if (owner === undefined) {
    owner = `pickup:${resources.nextDropLabelOwner++}`;
    resources.dropLabelOwners.set(state, owner);
  }
  return owner;
}
export function createDropVisualState(now: number, fresh = false, phase = 0): DropVisualState {
  return { progress: fresh ? 0 : 1, phase: Math.fround(phase), createdAt: now, now };
}
export function advanceDropVisualState(state: DropVisualState, now: number, deltaMs: number, collected = false): void {
  const target = collected ? 0 : 1;
  const step = Math.max(0, Math.min(1, 1 - Math.pow(0.8, Math.fround(deltaMs) * 0.06)));
  state.progress = Math.fround(Math.abs(state.progress - target) < 1e-7 ? target
    : state.progress + (target - state.progress) * step);
  state.now = now;
}
/** func763's pickup pass draws a black square rim around a rarity card.
* func587 supplies that card, the catalogue icon and its outlined name.
* The old radius/age arguments remain usable for isolated artwork fixtures;
* live world rendering supplies the retained native state on every frame. */
export function drawDrop(context: Canvas2DContext, type: number, _radius = 14, ageMs = Infinity, visual?: Readonly<DropVisualState>): void {
  const info = PETAL_INFO[type];
  if (!info || !type)
    return;
  const f = Math.fround;
  const progress = visual?.progress ?? (Number.isFinite(ageMs)
    ? f(1 - Math.pow(0.8, Math.max(0, ageMs) * 0.06)) : 1);
  const elapsed = visual ? visual.now - visual.createdAt : 0;
  const pulse = f(Math.sin(elapsed * 0.01) * 0.03 + 1);
  const scale = f(f(progress * pulse) * f(50 / 70));
  const angle = progress * 4 * Math.PI + (visual?.phase ?? 0);
  context.save();
  const inherited = context.getGlobalAlpha?.() ?? 1;
  const alpha = inherited * f(Math.sqrt(progress));
  context.setGlobalAlpha(alpha);
  // Keep the three native f32 scale stores separate before rotating. Folding
  // them into one scale changes the marker matrix during its arrival frames.
  let local: Canvas2DContext;
  if (context.transform) {
    local = localContext(context, progress);
    local = localContext(local, pulse);
    local = localContext(local, f(50 / 70));
    local = localContext(local, 1, angle);
  }
  else
    local = localContext(context, scale, angle);
  local.setLineJoin('round');
  local.setLineWidth(70 / 12);
  local.beginPath();
  local.rect(-36, -36, 72, 72);
  local.setStrokeRgb(0, 0, 0);
  local.setGlobalAlpha(alpha * 0.2);
  local.stroke();
  local.setGlobalAlpha(alpha);
  drawPetalCard(local, type, 70, visual ? dropLabelOwner(visual) : undefined);
  context.restore();
}
/** Native func587 card shared by pickups and both galleries. */
export function drawPetalCard(context: Canvas2DContext, type: number, size = 60, owner?: string): void {
  const info = PETAL_INFO[type];
  if (!info || !type)
    return;
  const f = Math.fround, local = context;
  const rarity = info.rarity;
  const color = cardColor(rarity);
  const line = f(size / 12), side = f(size - line);
  local.setLineJoin('round');
  setFill(local, color.fill);
  fillArtRectangle(local, -side / 2, -side / 2, side, side);
  local.beginPath();
  local.rect(-side / 2, -side / 2, side, side);
  local.setLineWidth(line);
  setStroke(local, color.stroke);
  local.stroke();
  inLocal(local, artwork => drawPetalIcon(artwork, type), f(size / 70), 0, 0, f(-size / 14));
  const matrix = local.getTransform?.() ?? [1, 0, 0, 1, 0, 0];
  // func391's +36 label font is smaller for the four long names.
  const nameFont = type === 20 ? 11 : [25, 26, 28].includes(type) ? 12 : 14;
  drawLabel(local, { text: info.name, font: f(f(nameFont * size) / 70),
    rasterScale: Math.fround(Math.max(Math.abs(matrix[0]), Math.abs(matrix[1]), Math.abs(matrix[2]), Math.abs(matrix[3])) * 2.4),
    cacheKey: owner }, 0, f(f(size * .5) + size * (-18 / 70)));
}
