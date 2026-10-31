import { hotbarRects } from '../ui/layout/hud.js';
import { inventoryLayout } from '../ui/layout/inventory.js';
import { contains } from '../ui/layout/rect.js';
/** Public HUD/menu drawing and pointer geometry. */
import { getHudLayout } from './hud.js';
export { createHudState,drawHud,equippedSlotCount,getHudLayout } from './hud.js';
export type { FlowerEntry,HudDeathState,HudFrameState,HudLayout,HudState } from './hud.js';
export { drawMenu } from './menu.js';

/** Hit-test the complete source hotbar: equipped slots, eight storage slots,
 * and discard. Coordinates/dimensions are CSS pixels (DPR independent).
 * Pass the current level, viewport and optional UI scale used for drawing.
 */
export function hotbarSlotAt(x: number, y: number, width = 1280, height = 720,
                             level = 1, mobile = false, uiScale?: number,
                             margin = 0): number | 'discard' | undefined {
  const layout = getHudLayout(width, height, level, mobile, uiScale);
  return hotbarRects(layout).find(rect => contains(rect, x / layout.scale, y / layout.scale, margin))?.slot;
}

/** Expanded inventory grid, matching drawInventory's sixteen slots. */
export function inventorySlotAt(x: number, y: number, width = 1280, height = 720): number | undefined {
  const index = inventoryLayout(width, height).slots.findIndex(rect => contains(rect, x, y));
  return index < 0 ? undefined : index;
}
