import { hotbarAnchor, hotbarRects } from '../../ui/layout/hud.js';
import { inventoryLayout } from '../../ui/layout/inventory.js';
import { HudContext } from '../canvas2d/transform-context.js';
import type { Event14Effect } from '../event-effects.js';
import { drawEvent14Effect } from '../event-effects.js';
import { petalSlotAnchor } from '../petal-motion.js';
import { drawPetalTooltipAt } from '../tooltip.js';
import { HudLayout } from './layout.js';
import { clamp, f } from './math.js';
import { baseTransform, emptySlot, filledSlot, label } from './primitives.js';
import { HudState } from './state.js';
export function drawHint(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  if (state.mobile || state.keyboardMovement)
    return;
  const center = Math.trunc(layout.logicalWidth / 2);
  const y = layout.logicalHeight;
  const amount = clamp(state.hintExpand ?? (state.movementDisabled ? 1 : 0));
  const width = 300 + 330 * amount;
  const height = 35 + 157 * amount;
  const radius = 10 + 10 * amount;
  const left = center - width / 2, right = center + width / 2, top = y - height;
  context.save();
  context.setLineJoin('round');
  context.setGlobalAlpha(0.5);
  context.setFillRgb(0, 0, 0);
  context.beginPath();
  baseTransform(context, layout);
  if (amount <= 0.001) {
    // Keep the native small-pill path verbatim (including its redundant
    // bottom corner quadratics); the HUD trace pins every command.
    context.moveTo(center - 140, y - 35);
    context.lineTo(center + 140, y - 35);
    context.quadraticCurveTo(center + 150, y - 35, center + 150, y - 25);
    context.lineTo(center + 150, y);
    context.quadraticCurveTo(center + 150, y, center + 150, y);
    context.lineTo(center - 150, y);
    context.quadraticCurveTo(center - 150, y, center - 150, y);
    context.lineTo(center - 150, y - 25);
    context.quadraticCurveTo(center - 150, y - 35, center - 140, y - 35);
  }
  else {
    context.moveTo(left + radius, top);
    context.lineTo(right - radius, top);
    context.quadraticCurveTo(right, top, right, top + radius);
    context.lineTo(right, y);
    context.lineTo(left, y);
    context.lineTo(left, top + radius);
    context.quadraticCurveTo(left, top, left + radius, top);
  }
  context.closePath();
  context.fill();
  context.setGlobalAlpha(1);
  context.setGlobalAlpha(1 - amount);
  label(context, 'Move mouse here to disable movement', 14, raster, center, y - 16);
  context.setGlobalAlpha(1);
  context.setGlobalAlpha(amount);
  label(context, 'You can also use [Q] and [E] to modify the inventory', 14, raster, center, y - 16);
  context.setGlobalAlpha(1);
  // The hotbar shares this save with the movement hint in clientFrame.
}
/** The source's equipped row and eight storage slots share a slot index, but
* an explicit storage snapshot takes precedence over flattened slot data. */
export function hotbarPetal(state: HudState, layout: HudLayout, slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= layout.equippedCount + 8)
    return 0;
  if (slot < layout.equippedCount)
    return state.slots === undefined ? 1 : state.slots[slot] ?? 0;
  return state.storageSlots === undefined ? state.slots?.[slot] ?? 0
    : state.storageSlots[slot - layout.equippedCount] ?? 0;
}
export function drawHotbar(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const motions = new Map(state.slotMotions?.map(motion => [motion.slot, motion]));
  const drawSlot = (slot: number, x: number, y: number, size: number, progress = 1): void => {
    const motion = motions.get(slot);
    filledSlot(context, motion?.type ?? hotbarPetal(state, layout, slot), motion?.x ?? x, motion?.y ?? y, motion?.size ?? size, layout, raster, progress, `hotbar:${slot}`, motion?.angle ?? 0);
  };
  const effects = new Map<number, Event14Effect>();
  for (const effect of state.slotEffects ?? []) {
    if (effect.phase === 'arriving' || effect.phase === 'settled')
      effects.set(effect.index, effect);
  }
  // layout.scale already includes this HUD surface's DPR. Effect positions
  // remain in native logical units, so apply that scale exactly once.
  const effectViewport = { width: layout.width, height: layout.height, level: state.level,
    mobile: state.mobile, uiScale: layout.scale, pixelRatio: 1,
    // Native1095 translates the renderer used by every803 card, including
    // settled pickups and retired cards. Their own flight anchors stay put.
    offsetY: state.death ? state.hudSlide ?? 0 : 0 };
  for (const rect of hotbarRects(layout))
    emptySlot(context, layout, rect.centerX, rect.centerY, rect.width, rect.slot === 'discard');
  const draggedType = state.draggedSlot === undefined ? 0 : hotbarPetal(state, layout, state.draggedSlot);
  for (let index = 0; index < layout.equippedCount; index++) {
    if (state.draggedSlot === index && !state.slotMotions)
      continue;
    if (!state.slotMotions && state.dragTargetSlot === index && draggedType) {
      filledSlot(context, draggedType, hotbarAnchor(layout, index).x, hotbarAnchor(layout, index).y, hotbarAnchor(layout, index).size, layout, raster, 1, `drag-target:${index}`);
      continue;
    }
    const effect = effects.get(index);
    if (effect) {
      drawEvent14Effect(context, effect, effectViewport);
      continue;
    }
    if (state.slotMotions)
      continue;
    drawSlot(index, hotbarAnchor(layout, index).x, hotbarAnchor(layout, index).y, hotbarAnchor(layout, index).size, state.slotProgress?.[index] ?? 1);
  }
  for (let index = 0; index < 8; index++) {
    const slot = layout.equippedCount + index;
    if (state.draggedSlot === slot && !state.slotMotions)
      continue;
    if (!state.slotMotions && state.dragTargetSlot === slot && draggedType) {
      filledSlot(context, draggedType, hotbarAnchor(layout, slot).x, hotbarAnchor(layout, slot).y, hotbarAnchor(layout, slot).size, layout, raster, 1, `drag-target:${slot}`);
      continue;
    }
    const effect = effects.get(slot);
    if (effect) {
      drawEvent14Effect(context, effect, effectViewport);
      continue;
    }
    if (state.slotMotions)
      continue;
    drawSlot(slot, hotbarAnchor(layout, slot).x, hotbarAnchor(layout, slot).y, hotbarAnchor(layout, slot).size);
  }
  if (!state.slotMotions && state.dragTargetSlot === 'discard' && draggedType) {
    filledSlot(context, draggedType, hotbarAnchor(layout, 'discard').x, hotbarAnchor(layout, 'discard').y, hotbarAnchor(layout, 'discard').size, layout, raster, 1, 'drag-target:discard');
  }
  for (const effect of state.slotEffects ?? []) {
    if (effect.phase === 'departing')
      drawEvent14Effect(context, effect, effectViewport);
  }
  const discard = hotbarAnchor(layout, 'discard');
  const hint = clamp(state.keyboardHint ?? 0);
  if (hint > 0) {
    context.save();
    baseTransform(context, layout);
    context.setGlobalAlpha(hint);
    for (let index = 0; index < layout.equippedCount; index++) {
      const anchor = hotbarAnchor(layout, index);
      label(context, `[${index + 1}]`, 16, raster, anchor.x, anchor.y - anchor.size / 2 - 15);
    }
    // Native804 moves Delete's hint beside the box once the equipped row
    // reaches six slots; the hint's alpha never changes its coordinates.
    label(context, '[T]', 16, raster, discard.x + (layout.equippedCount >= 6 ? 40 : 0), discard.y - discard.size / 2 + (layout.equippedCount >= 6 ? 8 : -15));
    context.setGlobalAlpha(1);
    context.restore();
  }
  const deleteAlpha = clamp(state.deleteAlpha ?? (state.draggedSlot !== undefined ? 1 : hint));
  if (deleteAlpha > 0.0001) {
    context.save();
    baseTransform(context, layout);
    context.setGlobalAlpha(deleteAlpha);
    label(context, 'Delete', 11, raster, discard.x, discard.y);
    context.restore();
  }
  // Native clientFrame draws ordinary cards, retired cards, then the retained
  // drag list. The Delete label belongs to the empty background pass.
  for (const motion of state.slotMotions ?? []) {
    if ((!motion.retired && effects.has(motion.slot)) || motion.opacity <= 0 || motion.size <= 0)
      continue;
    const inherited = context.getGlobalAlpha?.() ?? 1;
    const alpha = inherited * motion.opacity;
    const faded = new Proxy(context, { get(target, property) {
        if (property === 'setGlobalAlpha')
          return (value: number) => target.setGlobalAlpha(value * alpha);
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    filledSlot(faded, motion.type, motion.x, motion.y, motion.size, layout, raster, motion.retired ? 1 : state.slotProgress?.[motion.slot] ?? 1, `hotbar:${motion.slot}`, motion.angle);
  }
  if (!state.slotMotions && state.draggedSlot !== undefined && state.dragTargetSlot === undefined) {
    const type = hotbarPetal(state, layout, state.draggedSlot);
    const progress = clamp(state.dragProgress ?? 1);
    const lifted = state.dragSize ?? f(70 + 14 * (1 - Math.pow(1 - progress, 3)));
    const angle = state.dragAngle ?? 0;
    if (state.dragX !== undefined && state.dragY !== undefined) {
      const cssScale = layout.scale / (state.pixelRatio ?? 1);
      filledSlot(context, type, state.dragX / cssScale, state.dragY / cssScale, lifted, layout, raster, 1, `dragged:${state.draggedSlot}`, angle);
    }
    else if (state.pointerX !== undefined && state.pointerY !== undefined) {
      const cssScale = layout.scale / (state.pixelRatio ?? 1);
      filledSlot(context, type, state.pointerX / cssScale, state.pointerY / cssScale, lifted, layout, raster, 1, `dragged:${state.draggedSlot}`, angle);
    }
  }
  if (!state.mobile && !state.keyboardMovement)
    context.restore();
}
/** Wrap description text using real font metrics; no text is truncated into a
* single line or allowed to overflow the viewport at the right/bottom edge. */
export function drawHotbarTooltip(context: HudContext, state: HudState, layout: HudLayout, ratio: number): void {
  if (state.slotMotions && !state.inventoryOpen) {
    for (const motion of state.slotMotions) {
      if (motion.tooltipAlpha <= 0)
        continue;
      context.save();
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawPetalTooltipAt(context, motion.type, motion.x * layout.scale, (motion.y - motion.size / 2 - 10) * layout.scale, layout.width, layout.height, layout.scale, ratio, motion.tooltipAlpha);
      context.restore();
    }
    return;
  }
  const hovered = state.hoveredSlot;
  if (hovered === undefined || hovered < 0 || !Number.isInteger(hovered)
    || hovered >= (state.inventoryOpen ? 16 : layout.equippedCount + 8)
    || state.draggedSlot !== undefined)
    return;
  const type = state.inventoryOpen ? state.slots?.[hovered] ?? 0 : hotbarPetal(state, layout, hovered);
  if (!type)
    return;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const motion = state.slotMotions?.find(value => value.slot === hovered);
  const anchor = motion ?? petalSlotAnchor(layout, hovered);
  const inventory = inventoryLayout(layout.width, layout.height).slots[hovered];
  const inventoryX = inventory?.x + inventory?.width / 2;
  const inventoryY = inventory?.y;
  drawPetalTooltipAt(context, type, state.inventoryOpen ? inventoryX : anchor.x * layout.scale, state.inventoryOpen ? inventoryY - 10 : (anchor.y - anchor.size / 2 - 10) * layout.scale, layout.width, layout.height, layout.scale, ratio);
  context.restore();
}
