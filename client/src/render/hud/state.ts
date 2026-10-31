import { advanceSlotRecharge } from '../../state/loadout.js';
import type { Event14Effect } from '../event-effects.js';
import type { MenuRenderState } from '../menu-layout.js';
import type { MenuPreviewPass } from '../menu.js';
import { type PetalMotion } from '../petal-motion.js';
import { zoneWarningVisible } from './index.js';
import { clamp, f } from './math.js';
import { flowerEntries } from './scoreboard.js';
export interface FlowerEntry {
  readonly name: string;
  /** Authoritative score; leaderboard order follows this value. */
  readonly score: number;
  readonly local?: boolean;
  /** Presentation value produced by createHudState, after native smoothing. */
  readonly displayedScore?: number;
}
/** Snapshot of the death notification; elapsed time is supplied by the caller,
* so rendering a frame twice never advances or replays an event. */
export interface HudDeathState {
  readonly elapsedMilliseconds: number;
  /** Native binary32 animation state, advanced once per render frame. */
  readonly progress?: number;
  readonly killerName?: string;
  readonly respawnLevel?: number;
  /** Last death score (controller field 21). */
  readonly score?: number;
  /** Full carried inventory at death, including reserve slots. */
  readonly keptSlots?: readonly number[];
  /** Occupied retained-card index under the pointer, or undefined. */
  readonly hoveredSlot?: number;
  /** Smoothed per-card tooltip alpha from the native 0.7 exponential. */
  readonly tooltipAlpha?: readonly number[];
}
export interface HudState {
  readonly health: number;
  readonly maxHealth: number;
  readonly level: number;
  /** Native zone timer byte (field 63), 0..255. */
  readonly zoneProgress?: number;
  /** Retained native warning visibility and radial countdown, advanced once
  * per rendered frame by createHudState. */
  readonly zoneWarningAlpha?: number;
  readonly zoneCountdownProgress?: number;
  /** Death transition: level bar/hotbar recede from 0 to 400 logical units. */
  readonly hudSlide?: number;
  readonly chat?: readonly string[];
  readonly pixelRatio?: number;
  /** CSS viewport dimensions; the backing canvas includes pixelRatio. */
  readonly width?: number;
  readonly height?: number;
  readonly uiScale?: number;
  readonly mobile?: boolean;
  /** Equipped slots first (5/6/7/8 by level), then eight storage slots. */
  readonly slots?: readonly number[];
  readonly storageSlots?: readonly number[];
  /** Normalized field61 targets (0..1) supplied to createHudState, which
  * returns retained displayed fractions. drawHud squares those fractions
  * for the source func587 radial wipe. */
  readonly slotProgress?: readonly number[];
  /** Caller owns receipt/update/retirement. Active visuals replace their
  * static slot content; departing visuals draw alongside current contents.
  * drawHud never advances these states or draws a second world overlay. */
  readonly slotEffects?: readonly Event14Effect[];
  readonly slotMotions?: readonly Readonly<PetalMotion>[];
  readonly selectedSlot?: number;
  readonly inventoryOpen?: boolean;
  readonly hoveredSlot?: number;
  readonly draggedSlot?: number;
  readonly keyboardSlot?: number;
  /** Fade 0..1 for the native [1]..[8]/[T] inventory hints. */
  readonly keyboardHint?: number;
  readonly deleteAlpha?: number;
  /** Smooth position of the keyboard selection ring, in CSS pixels. */
  readonly keyboardHighlightX?: number;
  readonly keyboardHighlightY?: number;
  readonly keyboardHighlightSize?: number;
  readonly keyboardHighlightAlpha?: number;
  readonly pointerX?: number;
  readonly pointerY?: number;
  /** 0..1 drag-lift animation for the floating hotbar petal. */
  readonly dragProgress?: number;
  readonly dragX?: number;
  readonly dragY?: number;
  readonly dragAngle?: number;
  readonly dragSize?: number;
  /** Slot currently under the dragged petal; suppresses the ghost so the
  * petal visibly snaps into that slot. */
  readonly dragTargetSlot?: number | 'discard';
  /** 0..1 expansion of the movement-safe-area hint. */
  readonly hintExpand?: number;
  readonly petalDiscoveries?: number;
  readonly keyboardMovement?: boolean;
  readonly movementDisabled?: boolean;
  readonly menu?: boolean;
  readonly interactiveMenu?: boolean;
  /** Native menu still renders its world into a 1x1 offscreen surface. */
  readonly menuPreview?: MenuPreviewPass;
  /** A player received during the last menu pass already owns its hidden HUD. */
  readonly menuPreviewState?: HudState;
  readonly death?: boolean;
  readonly deathState?: HudDeathState;
  readonly status?: string;
  readonly animationTime?: number;
  readonly menuSeed?: number;
  /** Death→menu line: level and the items shown under "with:". */
  readonly menuRespawn?: {
    readonly level: number;
    readonly items: readonly number[];
  };
  /** Canvas-native menu panel state and discovered-petal pool. */
  readonly menuState?: MenuRenderState;
  readonly menuPetalTypes?: readonly number[];
  /** The frame owner can draw the moving input after capturing the menu. */
  readonly separateMenuInput?: boolean;
  /** Authoritative normalized XP progress from snapshot field 58. */
  readonly levelProgress?: number;
  readonly flowers?: number;
  readonly flowerEntries?: readonly FlowerEntry[];
  readonly playerName?: string;
  readonly score?: number;
  /** Optional native score field transition (120 ms), supplied by the
  * receiver. receivedAt must be the score field's clock, not any packet. */
  readonly scoreTransition?: {
    readonly previous: number;
    readonly receivedAt: number;
  };
  /** Map marker: normalized arena X, or playerX + arenaWidth. */
  readonly mapPosition?: number;
  readonly playerX?: number;
  readonly arenaWidth?: number;
}
export interface HudFrameState {
  /** Advance presentation once for this frame, then pass the returned state
  * to drawHud. Supply the actual frame delta on the first call; subsequent
  * calls can derive it from nowMilliseconds. Repeated timestamps do not tick. */
  update(target: HudState, nowMilliseconds: number, deltaMilliseconds?: number): HudState;
  reset(): void;
}
/** Per-HUD presentation memory. XP and scores are stored by leaderboard
* rank. Both start at zero, use a double-precision
* exponential with an f32 frame delta, snap within 1e-7, then store f32.
* Drawing stays pure: callers explicitly advance this state once per frame.
*/
export function createHudState(): HudFrameState {
  let progress = 0;
  let zoneAlpha = 0, zoneCountdown = 0;
  let hudSlide = 0;
  const deathTooltip: number[] = Array(16).fill(0);
  const scores: number[] = [];
  const recharges: number[] = [];
  const rechargeTypes: (number | undefined)[] = [];
  let lastTime: number | undefined;
  return {
    reset() { progress = 0; zoneAlpha = 0; zoneCountdown = 0; hudSlide = 0; deathTooltip.fill(0); scores.length = 0; recharges.length = 0; rechargeTypes.length = 0; lastTime = undefined; },
    update(target, nowMilliseconds, deltaMilliseconds) {
      const now = Number.isFinite(nowMilliseconds) ? nowMilliseconds : lastTime ?? 0;
      const repeated = lastTime !== undefined && now <= lastTime;
      const elapsed = repeated ? 0 : deltaMilliseconds ?? (lastTime === undefined ? 0 : now - lastTime);
      const delta = f(Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
      const amount = clamp(1 - Math.pow(0.8, delta * 0.06));
      lastTime = Math.max(lastTime ?? now, now);
      if (target.menu)
        return target;
      if (!repeated) {
        if (target.death) {
          // Native1095 retreats the level bar/hotbar by 400 logical units
          // with the same pow(0.9, dt * .06) curve as the level bar's shield
          // and the death overlay. Existing death UI is otherwise frozen.
          hudSlide = f(hudSlide + clamp(1 - Math.pow(0.9, delta * 0.06)) * (400 - hudSlide));
          const tooltipStep = clamp(1 - Math.pow(0.7, delta * 0.06));
          for (let index = 0; index < deathTooltip.length; index += 1) {
            const goal = target.deathState?.hoveredSlot === index ? 1 : 0;
            deathTooltip[index] = f(deathTooltip[index]
              + tooltipStep * (goal - deathTooltip[index]));
          }
        }
        else {
          hudSlide = 0;
          deathTooltip.fill(0);
          const warning = +zoneWarningVisible(target);
          zoneAlpha = f(zoneAlpha + clamp(1 - Math.pow(0.7, delta * 0.06)) * (warning - zoneAlpha));
          // client1095 uses the literal 0.003922 rather than 1/255.
          const countdown = f((target.zoneProgress ?? 0) * 0.003922);
          zoneCountdown = f(zoneCountdown + amount * (countdown - zoneCountdown));
        }
      }
      const approach = (current: number, value: number): number => repeated ? current : f(Math.abs(current - value) < 1e-7 ? value : current + amount * (value - current));
      if (target.levelProgress !== undefined)
        progress = approach(progress, f(clamp(target.levelProgress)));
      let score = target.score ?? 0;
      if (target.scoreTransition) {
        const previous = f(target.scoreTransition.previous);
        // clientFrame samples the receiver's local score transition before
        // casting it to uint32 for the leaderboard's second smoothing pass.
        score = f(previous + f(f(score) - previous)
          * clamp((now - target.scoreTransition.receivedAt) / 120));
      }
      const sampled = { ...target, score };
      const entries = flowerEntries(sampled).map((entry, index) => {
        const value = Number.isFinite(entry.score) ? Math.max(0, Math.min(0xffffffff, Math.trunc(entry.score))) : 0;
        const displayedScore = approach(scores[index] ?? 0, value);
        scores[index] = displayedScore;
        return { ...entry, displayedScore };
      });
      const slotProgress = target.slotProgress?.map((value, index) => {
        const type = target.slots?.[index];
        if (!repeated) {
          if (type !== rechargeTypes[index]) {
            recharges[index] = 1;
            rechargeTypes[index] = type;
          }
          recharges[index] = advanceSlotRecharge(recharges[index] ?? 1, value, delta);
        }
        return recharges[index] ?? 1;
      });
      return { ...target, levelProgress: progress, flowerEntries: entries, slotProgress,
        zoneWarningAlpha: zoneAlpha, zoneCountdownProgress: zoneCountdown, hudSlide,
        deathState: target.deathState && { ...target.deathState, tooltipAlpha: deathTooltip } };
    },
  };
}
