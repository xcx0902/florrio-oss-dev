import { inventoryLayout } from '../../ui/layout/inventory.js';
import { HudContext } from '../canvas2d/transform-context.js';
import { drawPetalIcon } from '../entity-art.js';
import { HudLayout } from './layout.js';
import { label } from './primitives.js';
import { HudState } from './state.js';
/** Retain the explicit expanded-inventory interaction used by the app, while
* the source's eight-slot storage row remains visible without opening it. */
export function drawInventory(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  if (!state.inventoryOpen)
    return;
  const geometry = inventoryLayout(layout.width, layout.height);
  const { x, y, width: panelWidth, height: panelHeight } = geometry.panel;
  const ratio = state.pixelRatio ?? 1;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.setGlobalAlpha(0.94);
  context.setFillRgb(28, 30, 28);
  context.fillRect(x, y, panelWidth, panelHeight);
  context.setGlobalAlpha(1);
  context.setStrokeRgb(220, 225, 220);
  context.setLineWidth(2);
  context.strokeRect(x, y, panelWidth, panelHeight);
  label(context, 'Inventory', 20, raster, x + panelWidth / 2, y + 21);
  for (let index = 0; index < 16; index++) {
    const { x: left, y: top, width: cell } = geometry.slots[index];
    context.setGlobalAlpha(0.88);
    context.setFillRgb(35, 40, 38);
    context.fillRect(left, top, cell, cell);
    context.setGlobalAlpha(1);
    context.setStrokeRgb(...(index === state.selectedSlot ? [255, 245, 180] : [200, 205, 200]) as [
      number,
      number,
      number
    ]);
    context.setLineWidth(index === state.selectedSlot ? 3 : 1.5);
    context.strokeRect(left, top, cell, cell);
    const type = state.slots?.[index] ?? 0;
    if (type) {
      context.save();
      context.setTransform(ratio, 0, 0, ratio, ratio * (left + cell / 2), ratio * (top + cell / 2));
      drawPetalIcon(context, type, 1);
      context.restore();
    }
  }
  context.restore();
}
