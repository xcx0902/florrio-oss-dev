/** Retained hotbar visuals, following original client func803/1101. All motion
 * is in logical HUD units, with the same order of binary32 stores as WASM. */
import type { HudLayout } from './hud.js';

const f = Math.fround;
const step = (base: number, delta: number): number => Math.max(0, Math.min(1, 1 - Math.pow(base, f(delta) * 0.06)));
const mix = (a: number, b: number, t: number): number => f(Math.abs(a - b) < 1e-7 ? b : a + (b - a) * t);

export interface PetalMotion {
  slot: number;
  readonly type: number;
  x: number; y: number; size: number; angle: number;
  lift: number; snap: number; snapX: number; snapY: number; snapSize: number;
  keyboard: number;
  tooltipAlpha: number;
  opacity: number;
  retired: boolean;
  retiredFrames: number;
  pointerX: number; pointerY: number;
  requestedSlot?: number;
  requestedUntil?: number;
}

export function petalSlotAnchor(layout: HudLayout, slot: number): { x: number; y: number; size: number } {
  const equipped = slot < layout.equippedCount;
  const index = slot === 16 ? 8 : slot - layout.equippedCount;
  return { x: f(equipped ? layout.equippedX + slot * 90 : layout.storageX + index * 65),
    y: f(equipped ? layout.equippedY : layout.storageY), size: equipped ? 70 : 50 };
}

/** Native snap searches circular regions with radius equal to the slot size.
 * Equal-type targets and the source are excluded, even when visually empty. */
export function petalSnapTarget(layout: HudLayout, types: readonly number[], source: number,
                                type: number, x: number, y: number): number | undefined {
  let target: number | undefined, nearest = Infinity;
  for (let slot = 0; slot <= 16; slot++) {
    if (slot !== 16 && (slot >= layout.equippedCount + 8 || slot === source || types[slot] === type)) continue;
    const anchor = petalSlotAnchor(layout, slot);
    const distance = (anchor.x - x) ** 2 + (anchor.y - y) ** 2;
    if (distance < f(anchor.size * anchor.size) && distance < nearest) { target = slot; nearest = distance; }
  }
  return target;
}

export function createPetalMotion(slot: number, type: number, layout: HudLayout): PetalMotion {
  const anchor = petalSlotAnchor(layout, slot);
  return { slot, type, ...anchor, angle: 0, lift: 0, snap: 0,
    snapX: 0, snapY: 0, snapSize: 0, keyboard: 0, tooltipAlpha: 0, opacity: 1,
    retired: false, retiredFrames: 0, pointerX: 0, pointerY: 0 };
}

export function advancePetalMotion(motion: PetalMotion, layout: HudLayout, types: readonly number[],
                                    now: number, delta: number, dragging: boolean,
                                    pointerX: number, pointerY: number, selected = false, hovered = false): void {
  const base = petalSlotAnchor(layout, motion.slot);
  if (motion.requestedUntil !== undefined && now > motion.requestedUntil) {
    motion.requestedSlot = motion.requestedUntil = undefined;
  }
  if (dragging) { motion.pointerX = f(pointerX); motion.pointerY = f(pointerY); }
  const follow = step(0.8, delta), snapFollow = step(0.6, delta);
  const target = dragging ? petalSnapTarget(layout, types, motion.slot, motion.type, pointerX, pointerY)
    : motion.requestedSlot;
  if (target !== undefined) {
    const anchor = petalSlotAnchor(layout, target);
    if (dragging && motion.snap < 0.001) {
      motion.snapX = anchor.x; motion.snapY = anchor.y; motion.snapSize = anchor.size;
    } else {
      motion.snapX = mix(motion.snapX, anchor.x, snapFollow);
      motion.snapY = mix(motion.snapY, anchor.y, snapFollow);
      motion.snapSize = mix(motion.snapSize, anchor.size, snapFollow);
    }
  }
  motion.snap = mix(motion.snap, target === undefined ? 0 : 1, snapFollow);
  motion.keyboard = mix(motion.keyboard, +selected, step(0.7, delta));
  const liftedX = mix(base.x, motion.pointerX, motion.lift);
  const liftedY = mix(base.y, motion.pointerY, motion.lift);
  const liftedSize = mix(base.size, f(base.size * 1.2), motion.lift);
  const selectedSize = mix(liftedSize, f(base.size * 1.3), motion.keyboard);
  motion.x = mix(motion.x, mix(liftedX, motion.snapX, motion.snap), follow);
  motion.y = mix(motion.y, mix(liftedY, motion.snapY, motion.snap), follow);
  motion.size = mix(motion.size, motion.retired ? 0 : mix(selectedSize, motion.snapSize, motion.snap), follow);
  motion.opacity = mix(motion.opacity, motion.retired ? 0 : 1, follow);
  // Native updates lift after calculating this frame's position and size.
  motion.lift = mix(motion.lift, +dragging, follow);
  const amplitude = Math.max(motion.keyboard, f(motion.lift * f(1 - motion.snap)));
  motion.angle = f(amplitude * f(Math.sin(now * 0.01) * 0.1));
  motion.tooltipAlpha = mix(motion.tooltipAlpha, +(hovered && !dragging && !motion.retired && motion.requestedSlot === undefined), step(0.7, delta));
}

export class PetalMotionState {
  private visuals = new Map<number, PetalMotion>();
  private dragged: PetalMotion | undefined;
  private readonly retired = new Set<PetalMotion>();
  private now = 0;
  reset(): void { this.visuals.clear(); this.retired.clear(); this.dragged = undefined; }
  sync(types: readonly number[], layout: HudLayout): void {
    const next = new Map<number, PetalMotion>();
    const used = new Set<PetalMotion>();
    for (let slot = 0; slot < layout.equippedCount + 8; slot++) {
      const type = types[slot] ?? 0;
      if (!type) continue;
      const current = this.visuals.get(slot);
      const visual = [...this.visuals.values()]
        .find(value => !used.has(value) && value.type === type && value.requestedSlot === slot)
        ?? (current?.type === type && !used.has(current) ? current : createPetalMotion(slot, type, layout));
      used.add(visual); visual.slot = slot;
      if (visual.requestedSlot === slot) visual.requestedSlot = undefined;
      next.set(slot, visual);
    }
    for (const visual of this.visuals.values()) if (!used.has(visual)) {
      visual.retired = true; this.retired.add(visual);
      if (visual === this.dragged) this.dragged = undefined;
    }
    this.visuals = next;
  }
  adopt(slot: number, position: Pick<PetalMotion, 'x' | 'y' | 'size'> | undefined): void {
    const visual = this.visuals.get(slot);
    if (visual && position) { visual.x = position.x; visual.y = position.y; visual.size = position.size; }
  }
  begin(slot: number): boolean {
    this.dragged = this.visuals.get(slot);
    return this.dragged !== undefined;
  }
  target(layout: HudLayout, types: readonly number[], x: number, y: number): number | undefined {
    return this.dragged && petalSnapTarget(layout, types, this.dragged.slot, this.dragged.type, x, y);
  }
  release(target?: number, layout?: HudLayout): void {
    if (this.dragged && target !== undefined) this.request(this.dragged.slot, target, layout);
    this.dragged = undefined;
  }
  /** Mouse and keyboard operations keep the same two native visual objects. */
  request(source: number, target: number, layout?: HudLayout): void {
    const visual = this.visuals.get(source);
    if (visual && source !== target) {
      const other = this.visuals.get(target);
      const request = (visual: PetalMotion, slot: number): void => {
        visual.requestedSlot = slot; visual.requestedUntil = this.now + 2000;
        if (layout) {
          const anchor = petalSlotAnchor(layout, slot);
          visual.snapX = anchor.x; visual.snapY = anchor.y; visual.snapSize = anchor.size;
        }
      };
      if (other && other !== visual) request(other, source);
      request(visual, target);
    }
  }
  update(layout: HudLayout, types: readonly number[], now: number, delta: number,
         x: number, y: number, keyboardSlot?: number, hoveredSlot?: number): readonly PetalMotion[] {
    this.now = now;
    this.sync(types, layout);
    for (const visual of this.visuals.values()) advancePetalMotion(visual, layout, types, now, delta,
      visual === this.dragged, f(x / layout.scale), f(y / layout.scale), visual.slot === keyboardSlot, visual.slot === hoveredSlot);
    for (const visual of this.retired) {
      advancePetalMotion(visual, layout, types, now, delta, false, 0, 0);
      if (++visual.retiredFrames > 1 && visual.opacity <= 0.0001) this.retired.delete(visual);
    }
    return [...this.visuals.values()].filter(visual => visual !== this.dragged)
      .concat([...this.retired], this.dragged ? [this.dragged] : []);
  }
}
