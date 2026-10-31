import type { Rect } from './rect.js';
const f = Math.fround;
export function equippedSlotCount(level = 1): number {
  return level < 15 ? 5 : level < 30 ? 6 : level < 45 ? 7 : 8;
}
export interface HudLayout {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly equippedCount: number;
  readonly equippedX: number;
  readonly equippedY: number;
  readonly storageX: number;
  readonly storageY: number;
}
/** Source clientFrame uses 0.000521 / 0.000926, a desktop 0.7 floor,
* ceil() for UI bounds and integer division for row centering. */
export function getHudLayout(width = 1280, height = 720, level = 1, mobile = false, uiScale?: number): HudLayout {
  const viewportWidth = Math.max(1, Number.isFinite(width) ? width : 1280);
  const viewportHeight = Math.max(1, Number.isFinite(height) ? height : 720);
  // clientFrame selects the larger of the width/height scale candidates
  // (the height term wins when width*0.000521 is smaller).
  const auto = Math.max(viewportWidth * 0.000521, viewportHeight * 0.000926);
  const requestedScale = f(uiScale ?? NaN);
  const scale = Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale : f(mobile ? auto : Math.max(0.7, auto));
  const logicalWidth = Math.ceil(f(viewportWidth / scale));
  const logicalHeight = Math.ceil(f(viewportHeight / scale));
  const equippedCount = equippedSlotCount(level);
  const center = Math.trunc(logicalWidth / 2);
  return {
    width: viewportWidth, height: viewportHeight, scale, logicalWidth, logicalHeight, equippedCount,
    equippedX: mobile ? 45 : center - (equippedCount * 70 + (equippedCount - 1) * 20) * 0.5 + 35,
    equippedY: logicalHeight - (mobile ? 110 : 145),
    storageX: mobile ? 35 : center - (8 * 15 + 9 * 50) * 0.5 + 25,
    storageY: logicalHeight - (mobile ? 35 : 70),
  };
}
export function hotbarRects(layout: HudLayout): readonly (Rect & {
  slot: number | 'discard';
  centerX: number;
  centerY: number;
})[] {
  return Array.from({ length: layout.equippedCount + 9 }, (_, i) => {
    const { x: centerX, y: centerY, size } = hotbarAnchor(layout, i === layout.equippedCount + 8 ? 'discard' : i);
    return { slot: i === layout.equippedCount + 8 ? 'discard' : i, x: centerX - size / 2, y: centerY - size / 2,
      width: size, height: size, centerX, centerY };
  });
}
export function hotbarAnchor(layout: HudLayout, slot: number | 'discard'): {
  x: number;
  y: number;
  size: number;
} {
  const discard = slot === 'discard' || slot === 16;
  const equipped = !discard && slot < layout.equippedCount;
  const index = discard ? 8 : Number(slot) - layout.equippedCount;
  return { x: Math.fround(equipped ? layout.equippedX + Number(slot) * 90 : layout.storageX + index * 65),
    y: Math.fround(equipped ? layout.equippedY : layout.storageY), size: equipped ? 70 : 50 };
}
