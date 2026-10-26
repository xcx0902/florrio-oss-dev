/** Public HUD/menu drawing and pointer geometry. */
import { getHudLayout } from './hud.js';
export { drawHud, createHudState, getHudLayout, equippedSlotCount } from './hud.js';
export type { HudState, HudFrameState, HudDeathState, FlowerEntry, HudLayout } from './hud.js';
export { drawMenu } from './menu.js';

/** Hit-test the complete source hotbar: equipped slots, eight storage slots,
 * and discard. Coordinates/dimensions are CSS pixels (DPR independent).
 * Pass the current level, viewport and optional UI scale used for drawing.
 */
export function hotbarSlotAt(x: number, y: number, width = 1280, height = 720,
                             level = 1, mobile = false, uiScale?: number,
                             margin = 0): number | 'discard' | undefined {
  const layout = getHudLayout(width, height, level, mobile, uiScale);
  const localX = x / layout.scale, localY = y / layout.scale;
  const hit = (centerX: number, centerY: number, size: number): boolean =>
    localX >= centerX - size / 2 - margin && localX < centerX + size / 2 + margin
    && localY >= centerY - size / 2 - margin && localY < centerY + size / 2 + margin;
  for (let index = 0; index < layout.equippedCount; index++) {
    if (hit(layout.equippedX + index * 90, layout.equippedY, 70)) return index;
  }
  for (let index = 0; index < 8; index++) {
    if (hit(layout.storageX + index * 65, layout.storageY, 50)) return layout.equippedCount + index;
  }
  if (hit(layout.storageX + 8 * 65, layout.storageY, 50)) return 'discard';
  return undefined;
}

/** Expanded inventory grid, matching drawInventory's sixteen slots. */
export function inventorySlotAt(x: number, y: number, width = 1280, height = 720): number | undefined {
  const panelX = width / 2 - 198, panelY = height / 2 - 125;
  for (let index = 0; index < 16; index++) {
    const left = panelX + 12 + index % 6 * 62;
    const top = panelY + 44 + Math.floor(index / 6) * 62;
    if (x >= left && x < left + 56 && y >= top && y < top + 56) return index;
  }
  return undefined;
}
