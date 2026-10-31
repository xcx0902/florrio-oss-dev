import type { HudLayout } from '../ui/layout/hud.js';
import { KeyboardInput } from '../input/keyboard.js';
import { PointerInput } from '../input/pointer.js';
import { TouchJoystick } from '../input/touch.js';
import type { GameApp } from '../app/game-app.js';
export class GameInput {
  pointer: PointerInput;
  keyboard: KeyboardInput;
  touch: TouchJoystick;
  pointerMovement: {
    angle: number;
    strength: number;
  };
  movementDisabled: boolean;
  constructor(readonly app: GameApp) {
    this.pointer = new PointerInput(this.app.canvas);
    this.keyboard = new KeyboardInput();
    this.touch = new TouchJoystick(this.app.canvas);
    this.pointerMovement = { angle: 0, strength: 0 };
    this.movementDisabled = false;
  }
  updateMovementDisabled(layout: HudLayout): void {
    const x = this.pointer.position.x / layout.scale;
    const y = this.pointer.position.y / layout.scale;
    const center = Math.trunc(layout.logicalWidth / 2);
    const safeArea = this.movementDisabled
      ? Math.abs(x - center) <= 320 && y >= layout.logicalHeight - 200
      : Math.abs(x - center) <= 150 && y >= layout.logicalHeight - 35;
    this.movementDisabled = this.app.session.started && !this.app.session.dead
      && (safeArea || this.app.loadout.inventoryOpen || this.app.loadout.dragSlot !== undefined
        || this.app.loadout.dragInventorySlot !== undefined);
  }
  intent(): {
    buttons: number;
    angle: number;
    strength: number;
  } {
    let { angle, strength } = this.pointerMovement;
    if (this.movementDisabled || this.app.menuControls.keyboardMovement)
      strength = 0;
    const keyboardX = (this.keyboard.isDown('KeyD') || this.keyboard.isDown('ArrowRight') ? 1 : 0)
      - (this.keyboard.isDown('KeyA') || this.keyboard.isDown('ArrowLeft') ? 1 : 0);
    const keyboardY = (this.keyboard.isDown('KeyS') || this.keyboard.isDown('ArrowDown') ? 1 : 0)
      - (this.keyboard.isDown('KeyW') || this.keyboard.isDown('ArrowUp') ? 1 : 0);
    if (keyboardX !== 0 || keyboardY !== 0) {
      angle = Math.atan2(keyboardY, keyboardX);
      strength = 1000;
    }
    if (this.touch.vector.active) {
      angle = Math.atan2(this.touch.vector.y, this.touch.vector.x);
      strength = 200 * Math.min(1, Math.hypot(this.touch.vector.x, this.touch.vector.y));
    }
    const uiPointer = this.movementDisabled || this.app.loadout.inventoryOpen || this.app.loadout.hotbarHover() !== undefined;
    const buttons = uiPointer ? 0 : ((this.pointer.buttons.left || this.keyboard.isDown('Space') ? 1 : 0)
      | (this.pointer.buttons.right || this.keyboard.isDown('ShiftLeft') || this.keyboard.isDown('ShiftRight') ? 2 : 0));
    return { buttons, angle, strength };
  }
  dispose(): void { this.pointer.dispose(); this.keyboard.dispose(); this.touch.dispose(); }
}
