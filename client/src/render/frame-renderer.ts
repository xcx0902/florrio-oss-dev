import { FrameContext } from './frame-context.js';
import type { SessionFrameView } from '../app/game-session.js';
import { getHudLayout, type HudLayout } from '../ui/layout/hud.js';
import { hotbarAnchor } from '../ui/layout/hud.js';
import { playerZoneProgress } from '../state/snapshot-projection.js';
import { RenderResources, withRenderResources } from './resources.js';
import { MenuInputAnimation } from '../render/menu-animation.js';
import { menuCloseRect, menuContentRect, menuScrollMax, settingsRowAt } from '../render/menu-layout.js';
import { drawMenuInput, drawMenuRespawnTooltips } from '../render/menu.js';
import { MovementHelper } from '../render/movement-helper.js';
import { PetalMotionState } from '../render/petal-motion.js';
import { PetalTransfers } from '../render/petal-transfers.js';
import { createHudState, drawHud, equippedSlotCount, type HudState } from '../render/ui.js';
import { drawWorld,releaseWorldVisuals } from '../render/world.js';
import { MOB_INFO } from '../schema/petals.js';
import { interpolateCameraTarget } from '../state/interpolation.js';
import { playerLoadoutSlots, playerSlotProgress } from '../state/loadout.js';
import { getPointerMovement, updatePanState } from '../state/pan.js';
import { PlayerWorldTransformCache } from '../state/world-transform.js';
import type { GameApp } from '../app/game-app.js';
export class FrameRenderer {
  readonly resources = new RenderResources();
  readonly context = new FrameContext();
  private loadoutKey:unknown;
  private loadoutMembership=-1;
  private displaySlots:number[]=[];
  private discoveryRevision=-1;
  private discoverySlots:readonly number[]|undefined;
  dispose(): void { withRenderResources(this.resources,()=>releaseWorldVisuals(this.app.world));this.resources.dispose(); this.petalTransfers.reset(); this.petalMotion.reset(); this.movementHelper.reset(); }
  hudState: import('./hud.js').HudFrameState;
  playerTransform: PlayerWorldTransformCache;
  petalTransfers: PetalTransfers;
  petalMotion: PetalMotionState;
  movementHelper: MovementHelper;
  menuInputAnimation: MenuInputAnimation;
  hintExpand: number;
  keyboardHint: number;
  keyboardHighlightX: number;
  keyboardHighlightY: number;
  keyboardHighlightSize: number;
  keyboardHighlightAlpha: number;
  keyboardHighlightReady: boolean;
  deleteAlpha: number;
  helperPlayer: {
    x: number;
    y: number;
  } | undefined;
  constructor(readonly app: GameApp) {
    this.hudState = createHudState();
    this.playerTransform = new PlayerWorldTransformCache();
    this.petalTransfers = new PetalTransfers();
    this.petalMotion = new PetalMotionState();
    this.movementHelper = new MovementHelper();
    this.menuInputAnimation = new MenuInputAnimation();
    this.hintExpand = 0;
    this.keyboardHint = 0;
    this.keyboardHighlightX = 0;
    this.keyboardHighlightY = 0;
    this.keyboardHighlightSize = 58;
    this.keyboardHighlightAlpha = 0;
    this.keyboardHighlightReady = false;
    this.deleteAlpha = 0;
  }
  frame = (now: number, delta: number, layout: HudLayout, view: SessionFrameView): void =>
    withRenderResources(this.resources, () => this.drawFrame(now, delta, layout, view));
  private drawFrame = (now: number, delta: number, layout: HudLayout, view: SessionFrameView): void => {
    const mouseX = this.app.input.pointer.position.x / layout.scale;
    const mouseY = this.app.input.pointer.position.y / layout.scale;
    const center = Math.trunc(layout.logicalWidth / 2);
    const { menuFrame, player, deathProgress } = view;
    if (menuFrame && player !== null)
      this.app.transitions.entryAt = now;
    // The native hint only opens from the small bottom pill; once opened the
    // pointer may travel through the taller inventory safe area.
    const hintReachX = this.hintExpand > 0.05 ? 315 : 150;
    const hintReachY = this.hintExpand > 0.05 ? 192 : 35;
    const hintTarget = this.app.session.started && !this.app.session.dead && !menuFrame && !this.app.loadout.inventoryOpen
      && Math.abs(mouseX - center) <= hintReachX && mouseY >= layout.logicalHeight - hintReachY ? 1 : 0;
    this.hintExpand += (hintTarget - this.hintExpand) * (1 - Math.pow(0.7, delta * 0.06));
    if (Math.abs(hintTarget - this.hintExpand) < 0.001)
      this.hintExpand = hintTarget;
    const hintKeyTarget = this.app.loadout.keyboardSlot !== undefined ? 1 : 0;
    this.keyboardHint = Math.fround(Math.abs(hintKeyTarget - this.keyboardHint) < 1e-7 ? hintKeyTarget
      : this.keyboardHint + (hintKeyTarget - this.keyboardHint) * (1 - Math.pow(0.6, Math.fround(delta) * 0.06)));
    const deleteTarget = +(this.app.loadout.keyboardSlot !== undefined || this.app.loadout.dragSlot !== undefined);
    this.deleteAlpha = Math.fround(Math.abs(deleteTarget - this.deleteAlpha) < 1e-7 ? deleteTarget
      : this.deleteAlpha + (deleteTarget - this.deleteAlpha) * (1 - Math.pow(0.7, Math.fround(delta) * 0.06)));
    if (this.app.loadout.keyboardSlot !== undefined && this.app.loadout.keyboardSlot < layout.equippedCount + 8) {
      const anchor = hotbarAnchor(layout, this.app.loadout.keyboardSlot);
      const targetX = anchor.x * layout.scale;
      const targetY = anchor.y * layout.scale;
      const targetSize = anchor.size + 4;
      if (!this.keyboardHighlightReady) {
        this.keyboardHighlightX = targetX;
        this.keyboardHighlightY = targetY;
        this.keyboardHighlightReady = true;
      }
      else {
        const follow = 1 - Math.pow(0.65, delta / 16);
        this.keyboardHighlightX += (targetX - this.keyboardHighlightX) * follow;
        this.keyboardHighlightY += (targetY - this.keyboardHighlightY) * follow;
      }
      this.keyboardHighlightSize += (targetSize - this.keyboardHighlightSize) * (1 - Math.pow(0.65, delta / 16));
      this.keyboardHighlightAlpha += (1 - this.keyboardHighlightAlpha) * (1 - Math.pow(0.7, delta * 0.06));
    }
    else {
      this.keyboardHighlightAlpha += (0 - this.keyboardHighlightAlpha) * (1 - Math.pow(0.7, delta * 0.06));
    }
    if (Math.abs(this.keyboardHighlightAlpha) < 0.001)
      this.keyboardHighlightAlpha = 0;
    if (this.app.loadout.keyboardSlot !== undefined)
      this.petalMotion.adopt(this.app.loadout.keyboardSlot, this.petalTransfers.detachSlot(this.app.loadout.keyboardSlot));
    const slotMotions = this.petalMotion.update(layout, this.app.loadout.hotbarTypes, now, delta, this.app.input.pointer.position.x, this.app.input.pointer.position.y, this.app.loadout.keyboardSlot, !this.app.input.pointer.buttons.left && this.app.loadout.dragSlot === undefined ? this.app.loadout.hoveredSlot() : undefined);
    const menuHover = this.app.menuControls.renderState();
    let clickable = false;
    if (!this.app.session.started) {
      clickable = !!menuHover.hoveredTab;
      if (menuHover.panel) {
        const menuScale = Math.fround(Math.max(0.7, Math.fround(Math.max(this.app.canvas.clientWidth * 0.000521, this.app.canvas.clientHeight * 0.000926))));
        const height = Math.ceil(Math.fround(this.app.canvas.clientHeight / menuScale));
        const alpha = menuHover.panelAlphas?.[menuHover.panel] ?? 1;
        const close = menuCloseRect(menuHover.panel, height, alpha);
        clickable ||= menuHover.pointerX >= close.x && menuHover.pointerX <= close.x + close.width
          && menuHover.pointerY >= close.y && menuHover.pointerY <= close.y + close.height;
        clickable ||= menuHover.panel === 'Settings' && settingsRowAt(menuHover.pointerX, menuHover.pointerY, height, alpha) !== undefined;
        if (menuHover.panel !== 'Settings') {
          const content = menuContentRect(menuHover.panel, height, alpha);
          const max = menuScrollMax(menuHover.panel, height, menuHover.mobs);
          clickable ||= max > 0 && menuHover.pointerX >= content.x + content.width - 14
            && menuHover.pointerX <= content.x + content.width
            && menuHover.pointerY >= content.y && menuHover.pointerY <= content.y + content.height;
        }
      }
    }
    else if (!this.app.session.dead) {
      const hovered = this.app.loadout.hoveredSlot();
      clickable = this.app.loadout.dragSlot !== undefined || (hovered !== undefined && !!(this.app.loadout.inventoryOpen ? this.app.loadout.inventoryTypes[hovered] : this.app.loadout.hotbarTypes[hovered]));
    }
    this.app.canvas.style.cursor = clickable ? 'pointer' : 'default';
    void this.app.audio;
    if (player !== null) {
      // The archived updateCamera follows the entity-table interpolation, not
      // the raw snapshot position; use the same 120 ms transform the renderer
      // uses so the camera target and the drawn player stay in step.
      const target = interpolateCameraTarget(player.entity, now);
      const displayed = this.playerTransform.get(player.entity, now, { x: this.app.camera.panX, y: this.app.camera.panY });
      const panInput = {
        displayedX: displayed.x, displayedY: displayed.y,
        mouseX: this.app.input.pointer.position.x, mouseY: this.app.input.pointer.position.y,
        cameraX: this.app.camera.x, cameraY: this.app.camera.y, zoom: this.app.camera.zoom,
        viewportWidth: this.app.camera.viewportWidth, viewportHeight: this.app.camera.viewportHeight,
        deltaMs: delta, enabled: !this.app.mobileUi && !this.app.input.movementDisabled,
      };
      this.app.input.pointerMovement = getPointerMovement(panInput);
      const pan = updatePanState({ x: this.app.camera.panX, y: this.app.camera.panY }, panInput);
      this.app.camera.panX = pan.x;
      this.app.camera.panY = pan.y;
      // Native queuePlayerInput precedes transform-cache invalidation. Refresh
      // the render's transform only after consuming that previous-frame cache.
      this.playerTransform.invalidate();
      this.playerTransform.get(player.entity, now, pan);
      const hitAt = this.app.world.hitTime(player.entity.handle);
      if (hitAt !== undefined)
        this.app.camera.markHit(hitAt);
      // Camera update scans the equipped petal slots: Antennae widens
      // the view from a 0.9 to a 0.63 scene scale.
      const equipped = Math.min(16, equippedSlotCount(player.entity.level ?? 1));
      const antennae = (playerLoadoutSlots(player.entity) ?? []).slice(0, equipped).includes(25);
      this.app.camera.follow(target.x, target.y, delta, pan.x, pan.y, now, antennae ? 0.63 : 0.9);
    }
    const menuInput = this.menuInputAnimation.advance(now, delta, this.app.world.lastSequence > 0, menuFrame, getHudLayout(this.app.canvas.clientWidth, this.app.canvas.clientHeight).logicalHeight, this.app.mobileUi);
    if (this.app.frozen)
      this.app.menuControls.show(false);
    else
      this.app.menuControls.presentInput(menuInput, !this.app.session.started);
    this.app.context2d.setTransform(1, 0, 0, 1, 0, 0);
    this.app.context2d.clearRect(0, 0, this.app.canvas.width, this.app.canvas.height);
    this.app.renderContext.syncTransform?.();
    let playerHudState: HudState | undefined;
    if (player) {
      const key=player.entity.byteArrayFields?.[60]??player.entity.denseFields?.[60];
      if(this.loadoutKey!==key||this.loadoutMembership!==this.app.world.membershipRevision) {
        this.displaySlots=this.app.world.playerLoadout();
        this.loadoutKey=key;this.loadoutMembership=this.app.world.membershipRevision;
      }
      const displaySlots=this.displaySlots;
      this.app.loadout.inventoryTypes = displaySlots;
      this.app.loadout.hotbarTypes.splice(0, this.app.loadout.hotbarTypes.length, ...displaySlots);
      if(this.discoveryRevision!==this.app.world.discoveryRevision||this.discoverySlots!==displaySlots) {
        const mobs:(readonly [number,string])[]=[];
        for(const entity of this.app.world.entitiesOfKind(2)) {
          const type=entity.speciesId??0;if(MOB_INFO[type])mobs.push([type,MOB_INFO[type].name]);
        }
        this.app.menuControls.discover(displaySlots,mobs);
        this.discoveryRevision=this.app.world.discoveryRevision;this.discoverySlots=displaySlots;
      }
      playerHudState = {
        health: player.entity.health, maxHealth: player.entity.maxHealth,
        level: player.entity.level ?? 1, levelProgress: player.entity.levelProgress,
        zoneProgress: playerZoneProgress(player.entity),
        score: player.entity.score, pixelRatio: this.app.dpr, chat: this.app.world.chat,
        scoreTransition: player.entity.receivedScoreAt === undefined ? undefined
          : { previous: player.entity.previousScore ?? player.entity.score ?? 0,
            receivedAt: player.entity.receivedScoreAt },
        width: this.app.canvas.clientWidth, height: this.app.canvas.clientHeight,
        mobile: this.app.mobileUi, playerX: player.entity.x, arenaWidth: 50000,
        slots: displaySlots,
        selectedSlot: this.app.loadout.selectedSlot,
        inventoryOpen: this.app.loadout.inventoryOpen,
        playerName: this.app.menuControls.name.value || undefined, keyboardMovement: this.app.menuControls.keyboardMovement,
        movementDisabled: this.app.input.movementDisabled,
        draggedSlot: this.app.loadout.dragSlot,
        keyboardSlot: this.app.loadout.keyboardSlot,
        keyboardHint: this.keyboardHint,
        hintExpand: this.hintExpand,
        deleteAlpha: this.deleteAlpha,
        keyboardHighlightX: this.keyboardHighlightX,
        keyboardHighlightY: this.keyboardHighlightY,
        keyboardHighlightSize: this.keyboardHighlightSize,
        keyboardHighlightAlpha: this.keyboardHighlightAlpha,
        slotMotions,
        petalDiscoveries: this.app.menuControls.petalDiscoveryCount,
        slotProgress: playerSlotProgress(player.entity),
        hoveredSlot: this.app.loadout.hoveredSlot(), pointerX: this.app.input.pointer.position.x, pointerY: this.app.input.pointer.position.y,
      };
    }
    const drawFrameHud = (state: HudState): void => {
      const target = state.menuPreviewState ?? state;
      const slotEffects = this.petalTransfers.update(now, delta, target.slots ?? [], target.slotProgress, {
        width: target.width, height: target.height, level: target.level,
        mobile: target.mobile, uiScale: target.uiScale, pixelRatio: target.pixelRatio,
      });
      const updated = this.hudState.update({ ...target, slotEffects }, now, delta);
      drawHud(this.app.renderContext, state.menuPreviewState ? { ...state, menuPreviewState: updated } : updated);
    };
    const drawMovementGuide = (): void => {
      if (player)
        this.helperPlayer = this.playerTransform.get(player.entity, now, { x: this.app.camera.panX, y: this.app.camera.panY });
      if (!this.helperPlayer)
        return;
      this.movementHelper.draw(this.app.renderContext, {
        enabled: this.app.menuControls.movementHelper, keyboardMovement: this.app.menuControls.keyboardMovement,
        mobile: this.app.mobileUi, alive: player !== null, deltaMs: delta,
        pointerX: this.app.input.pointer.position.x, pointerY: this.app.input.pointer.position.y,
        playerX: this.helperPlayer.x, playerY: this.helperPlayer.y, cameraX: this.app.camera.x, cameraY: this.app.camera.y,
        zoom: this.app.camera.zoom, viewportWidth: this.app.camera.viewportWidth, viewportHeight: this.app.camera.viewportHeight,
        pixelRatio: this.app.dpr,
      });
    };
    if (menuFrame) {
      drawFrameHud({
        health: 100, maxHealth: 100, level: 1, pixelRatio: this.app.dpr, menu: true, interactiveMenu: !this.app.frozen,
        status: this.app.session.status,
        animationTime: now,
        width: this.app.canvas.clientWidth, height: this.app.canvas.clientHeight,
        mobile: this.app.mobileUi, petalDiscoveries: this.app.menuControls.petalDiscoveryCount,
        menuState: this.app.menuControls.renderState(), menuPetalTypes: this.app.menuControls.discoveredPetals,
        menuRespawn: this.app.session.menuRespawn,
        separateMenuInput: !this.app.frozen,
        menuPreviewState: playerHudState,
        menuPreview: (preview, view) => {
          this.app.menuCamera.resize(view.width, view.height, view.pixelRatio);
          this.app.menuCamera.x = view.cameraX;
          this.app.menuCamera.y = view.cameraY;
          this.app.menuCamera.zoom = view.zoom;
          drawWorld(preview, this.app.world, this.app.menuCamera, now, { menuPreview: true });
          return this.app.world.lastSequence > 0;
        },
      });
      if (menuFrame && player !== null)
        this.app.transitions.captureEntryCanvas();
    }
    else if (player === null) {
      drawWorld(this.app.renderContext, this.app.world, this.app.camera, now, {frame:this.context,deltaMs:delta});
      drawMovementGuide();
      drawFrameHud({
        health: 0, maxHealth: 100, level: this.app.session.lastLevel, pixelRatio: this.app.dpr,
        chat: this.app.world.chat, death: true, slots: this.app.session.lastSlots,
        selectedSlot: this.app.loadout.selectedSlot,
        deathState: {
          elapsedMilliseconds: Math.max(0, now - (this.app.session.deathAt ?? now)),
          progress: deathProgress,
          killerName: this.app.session.lastDeathMetadata.killerName || 'A mysterious entity',
          respawnLevel: this.app.session.lastDeathMetadata.deathLevel || this.app.session.lastLevel,
          score: this.app.session.lastDeathMetadata.score,
          keptSlots: this.app.session.lastSlots,
          hoveredSlot: this.app.loadout.deathHoveredSlot(deathProgress),
        },
        width: this.app.canvas.clientWidth, height: this.app.canvas.clientHeight,
        mobile: this.app.mobileUi,
      });
    }
    else {
      drawWorld(this.app.renderContext, this.app.world, this.app.camera, now, {frame:this.context,deltaMs:delta,playerPosition:player?this.playerTransform.get(player.entity,now,{x:this.app.camera.panX,y:this.app.camera.panY}):undefined});
      drawMovementGuide();
      drawFrameHud(playerHudState!);
    }
    if (this.app.transitions.entryAt !== undefined && player !== null)
      this.app.transitions.drawEntryTransition(now);
    if (!this.app.frozen && menuInput.active && menuInput.opacity > 0.0001) {
      this.app.renderContext.save();
      drawMenuInput(this.app.renderContext, this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.session.status, this.app.dpr, now, !this.app.session.started, menuInput);
      this.app.renderContext.restore();
    }
    if (menuFrame) {
      drawMenuRespawnTooltips(this.app.renderContext, this.app.canvas.clientWidth, this.app.canvas.clientHeight, this.app.dpr, this.app.session.menuRespawn, this.app.menuControls.renderState());
    }
    if (this.app.transitions.exitAt !== undefined && !this.app.session.enteredWorld)
      this.app.transitions.drawExitTransition();
  };
}
