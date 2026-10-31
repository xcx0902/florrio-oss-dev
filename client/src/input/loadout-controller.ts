import { equippedSlotCount, getHudLayout, hotbarSlotAt, inventorySlotAt } from '../render/ui.js';
import { deathCardRects } from '../ui/layout/death.js';
import { contains } from '../ui/layout/rect.js';
import type { GameApp } from '../app/game-app.js';
export class LoadoutController {
  inventoryOpen: boolean;
  selectedSlot: number;
  keyboardSlot: number | undefined;
  keyboardSlotAt: number;
  hotbarTypes: number[];
  dragSlot: number | undefined;
  dragInventorySlot: number | undefined;
  inventoryTypes: number[];
  constructor(readonly app: GameApp) {
    this.inventoryOpen = false;
    this.selectedSlot = 0;
    this.keyboardSlotAt = 0;
    this.hotbarTypes = [1, 1, 1, 1, 1];
    this.inventoryTypes = [];
  }
  handleUiKeys = (): void => {
    if (!this.app.session.started || this.app.session.dead) {
      if (this.app.input.keyboard.consumePressed('Escape'))
        this.app.menuControls.open(undefined);
      return;
    }
    const now = performance.now();
    if (this.app.input.keyboard.consumePressed('KeyI') || this.app.input.keyboard.consumePressed('Tab'))
      this.inventoryOpen = !this.inventoryOpen;
    if (this.app.input.keyboard.consumePressed('Escape')) {
      this.inventoryOpen = false;
      this.keyboardSlot = undefined;
    }
    const equipped = equippedSlotCount(this.app.session.localPlayer()?.entity.level ?? 1);
    if (now - this.keyboardSlotAt > 5000 || !this.hotbarTypes[this.keyboardSlot ?? -1])
      this.keyboardSlot = undefined;
    const reserves = this.hotbarTypes.slice(equipped, equipped + 8)
      .flatMap((type, index) => type ? [equipped + index] : []);
    const previous = this.app.input.keyboard.consumePressed('KeyQ'), next = this.app.input.keyboard.consumePressed('KeyE');
    if (previous || next) {
      if (reserves.length) {
        const current = reserves.indexOf(this.keyboardSlot ?? -1);
        this.keyboardSlot = reserves[current < 0 ? 0 : (current + (previous ? -1 : 1) + reserves.length) % reserves.length];
        this.keyboardSlotAt = now;
      }
    }
    for (let index = 0; index < 8; index++) {
      if (this.app.input.keyboard.consumePressed(`Digit${index + 1}`)) {
        this.selectedSlot = index;
        const source = this.keyboardSlot ?? reserves[0];
        if (source !== undefined && index < equipped && this.hotbarTypes[source] !== this.hotbarTypes[index]) {
          const layout = getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.localPlayer()?.entity.level ?? 1, this.app.mobileUi);
          this.app.renderer.petalMotion.sync(this.hotbarTypes, layout);
          for (const slot of [source, index])
            this.app.renderer.petalMotion.adopt(slot, this.app.renderer.petalTransfers.detachSlot(slot));
          this.app.renderer.petalMotion.request(source, index, layout);
          this.app.session.submit(this.app.inputEncoder.swap(source, this.hotbarTypes[source], index, this.hotbarTypes[index] ?? 0));
          this.keyboardSlotAt = now;
        }
      }
    }
    if (this.app.input.keyboard.consumePressed('KeyT')) {
      const hovered = this.hotbarHover();
      const target = this.keyboardSlot ?? (typeof hovered === 'number' ? hovered : undefined);
      if (target !== undefined && this.hotbarTypes[target]) {
        const layout = getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.localPlayer()?.entity.level ?? 1, this.app.mobileUi);
        this.app.renderer.petalMotion.sync(this.hotbarTypes, layout);
        this.app.renderer.petalMotion.adopt(target, this.app.renderer.petalTransfers.detachSlot(target));
        this.app.renderer.petalMotion.request(target, 16, layout);
        this.app.session.submit(this.app.inputEncoder.discard(target, this.hotbarTypes[target]));
        if (this.keyboardSlot !== undefined) {
          this.keyboardSlot = reserves.find(slot => slot > target) ?? reserves.find(slot => slot !== target);
        }
        this.keyboardSlotAt = now;
      }
    }
  };
  hoveredSlot = (): number | undefined => {
    const inventory = this.inventoryHover();
    if (inventory !== undefined)
      return inventory;
    if (this.inventoryOpen)
      return undefined;
    const hotbar = this.hotbarHover();
    return typeof hotbar === 'number' ? hotbar : undefined;
  };
  deathHoveredSlot = (amount: number): number | undefined => {
    if (!this.app.session.dead || this.app.session.lastSlots.length === 0)
      return undefined;
    const layout = getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.lastLevel, this.app.mobileUi);
    return deathCardRects(this.app.session.lastSlots, this.app.session.lastLevel, { width: this.app.canvas.clientWidth, height: this.app.canvas.clientHeight, mobile: this.app.mobileUi }, amount)
      .find(rect => contains(rect, this.app.input.pointer.position.x / layout.scale, this.app.input.pointer.position.y / layout.scale))?.index;
  };
  hotbarHover = (x = this.app.input.pointer.position.x, y = this.app.input.pointer.position.y): number | 'discard' | undefined => {
    return hotbarSlotAt(x, y, this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.localPlayer()?.entity.level ?? 1, this.app.mobileUi);
  };
  handleHotbarPointer = (): void => {
    if (!this.app.session.started || this.app.session.dead) {
      this.app.input.pointer.consumeLeftPress();
      this.app.input.pointer.consumeLeftRelease();
      return;
    }
    const slotAtPointer = (): number | 'discard' | undefined => this.hotbarHover();
    const press = this.app.input.pointer.consumeLeftPress();
    if (press && this.dragSlot === undefined && this.dragInventorySlot === undefined) {
      const fromInventory = this.inventoryOpen ? inventorySlotAt(press.x, press.y, this.app.canvas.clientWidth, this.app.canvas.clientHeight) : undefined;
      const fromHotbar = this.hotbarHover(press.x, press.y);
      if (typeof fromInventory === 'number')
        this.dragInventorySlot = fromInventory;
      else if (typeof fromHotbar === 'number' && this.hotbarTypes[fromHotbar]) {
        const layout = getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.localPlayer()?.entity.level ?? 1, this.app.mobileUi);
        this.app.renderer.petalMotion.sync(this.hotbarTypes, layout);
        this.app.renderer.petalMotion.adopt(fromHotbar, this.app.renderer.petalTransfers.detachSlot(fromHotbar));
        if (this.app.renderer.petalMotion.begin(fromHotbar))
          this.dragSlot = fromHotbar;
      }
    }
    if (this.app.input.pointer.consumeLeftRelease()) {
      let target = slotAtPointer();
      if (this.dragSlot !== undefined) {
        const layout = getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.localPlayer()?.entity.level ?? 1, this.app.mobileUi);
        const snap = this.app.renderer.petalMotion.target(layout, this.hotbarTypes, this.app.input.pointer.position.x / layout.scale, this.app.input.pointer.position.y / layout.scale);
        target = snap === 16 ? 'discard' : snap;
      }
      if (this.dragInventorySlot !== undefined) {
        const type = this.inventoryTypes[this.dragInventorySlot] ?? 0;
        if (typeof target === 'number') {
          this.app.session.submit(this.app.inputEncoder.swap(this.dragInventorySlot, type, target, this.hotbarTypes[target] ?? 0));
        }
        else if (target === 'discard') {
          this.app.session.submit(this.app.inputEncoder.discard(this.dragInventorySlot, type));
        }
      }
      else if (this.dragSlot !== undefined) {
        if (typeof target === 'number' && target !== this.dragSlot
          && target < this.hotbarTypes.length && this.dragSlot < this.hotbarTypes.length) {
          this.app.session.submit(this.app.inputEncoder.swap(this.dragSlot, this.hotbarTypes[this.dragSlot] ?? 0, target, this.hotbarTypes[target]));
        }
        else if (target === 'discard' && this.hotbarTypes[this.dragSlot]) {
          this.app.session.submit(this.app.inputEncoder.discard(this.dragSlot, this.hotbarTypes[this.dragSlot]));
        }
      }
      this.app.renderer.petalMotion.release(target === 'discard' ? 16 : target, getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.localPlayer()?.entity.level ?? 1, this.app.mobileUi));
      this.dragSlot = undefined;
      this.dragInventorySlot = undefined;
    }
    this.app.input.pointer.consumeRightClick();
    if (this.app.input.pointer.consumeDoubleClick()) {
      const slot = slotAtPointer();
      if (typeof slot === 'number' && slot < this.hotbarTypes.length && slot !== this.selectedSlot) {
        this.app.session.submit(this.app.inputEncoder.swap(this.selectedSlot, this.hotbarTypes[this.selectedSlot] ?? 0, slot, this.hotbarTypes[slot]));
      }
    }
  };
  inventoryHover = (): number | undefined => {
    if (!this.inventoryOpen)
      return undefined;
    return inventorySlotAt(this.app.input.pointer.position.x, this.app.input.pointer.position.y, this.app.canvas.clientWidth, this.app.canvas.clientHeight);
  };
}
