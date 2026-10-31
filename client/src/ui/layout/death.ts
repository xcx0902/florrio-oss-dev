import { getHudLayout } from './hud.js';
import { PETAL_INFO } from '../../schema/petals.js';
import type { Rect } from './rect.js';
export interface DeathCard extends Rect {
  readonly index: number;
  readonly type: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly size: number;
}
/** Retained cards in logical UI units; consumers apply layout.scale once. */
export function deathCardRects(items: readonly number[], level: number, viewport: {
  width: number;
  height: number;
  mobile?: boolean;
  uiScale?: number;
}, progress: number): readonly DeathCard[] {
  const layout = getHudLayout(viewport.width, viewport.height, level, viewport.mobile, viewport.uiScale);
  const y = layout.logicalHeight - 45 + Math.fround(Math.fround(1 - progress) * layout.logicalHeight);
  let left = 20;
  const cards: DeathCard[] = [];
  for (let index = 0; index < 16; index++) {
    const type = items[index] ?? 0;
    if (!type || !PETAL_INFO[type])
      continue;
    const size = index < layout.equippedCount ? 60 : 50;
    cards.push({ index, type, x: left, y: y - size / 2, width: size, height: size, centerX: left + size / 2, centerY: y, size });
    left += size + 10;
  }
  return cards;
}
