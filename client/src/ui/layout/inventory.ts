import type { Rect } from './rect.js';
export function inventoryLayout(width: number, height: number): {
  panel: Rect;
  slots: readonly Rect[];
} {
  const panel = { x: width / 2 - 198, y: height / 2 - 125, width: 396, height: 250 };
  return { panel, slots: Array.from({ length: 16 }, (_, index) => ({
      x: panel.x + 12 + index % 6 * 62, y: panel.y + 44 + Math.floor(index / 6) * 62, width: 56, height: 56,
    })) };
}
