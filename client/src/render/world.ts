import { FrameContext } from './frame-context.js';
import { renderResources } from './resources.js';
import { releaseLabel } from './canvas2d/text-cache.js';
import type { CameraState } from '../state/camera.js';
import { isOutsideWorldBounds,worldViewportBounds,playerWorldPosition } from '../state/world-transform.js';
import type { EntityState,WorldState } from '../state/world.js';
import type { Canvas2DContext } from './canvas2d/context.js';
import {
advanceDropVisualState,
createDropVisualState,
createPlayerFaceState,
createPlayerHealthBarState,
drawDrop,
drawGroundWeb,
drawHornetMissile,
drawLaunchedPea,
drawPetalInstance,
drawPlayerFace,
drawPlayerHealthBar,
drawSpecies,
type DropVisualState,
type PlayerFaceState,
type PlayerHealthBarState,
} from './entity-art.js';
import { createArtRandom,createUniqueTrail,drawUniqueTrail,type UniqueTrail } from './petal-effects.js';
import { advanceSpeciesAnimation,createSpeciesAnimationState,type SpeciesAnimationState } from './species-animation.js';

const ARENA_WIDTH = 50000;
const ARENA_HEIGHT = 4000;
const f = Math.fround;
interface ArenaBoundary { left: number; right: number; top: number; bottom: number; level: number; at: number }
const arenaBoundaries = new WeakMap<WorldState, ArenaBoundary>();
interface PlayerVisual { face: PlayerFaceState; health: PlayerHealthBarState; fresh: boolean }
interface PetalVisual { phase: number; trail: UniqueTrail; webProgress: number }
interface WorldVisuals {
  epoch:number;
  at: number;
  players: Map<number, PlayerVisual>;
  species: Map<number, SpeciesAnimationState>;
  drops: Map<number, DropVisualState>;
  dropRandom: number;
  petals: Map<number, PetalVisual>;
  randomAngle: () => number;
}
const worldVisuals = new WeakMap<WorldState, WorldVisuals>();
const frameContexts = new WeakMap<WorldState,FrameContext>();
const visibleBuffers = new WeakMap<WorldState,{items:VisibleEntity[];pool:VisibleEntity[]}>();

export function releaseWorldVisuals(world:WorldState):void {
  const visuals=worldVisuals.get(world),resources=renderResources();
  if(visuals)for(const drop of visuals.drops.values()) {
    const owner=resources.dropLabelOwners.get(drop);if(owner!==undefined)releaseLabel(owner);
    resources.dropLabelOwners.delete(drop);
  }
  worldVisuals.delete(world);frameContexts.delete(world);visibleBuffers.delete(world);
}
export function worldFrameStats(world:WorldState) {return frameContexts.get(world)?.stats??{worldScans:0,sorts:0,visible:0,drawn:0,interpolations:0};}
export function worldVisualCounts(world:WorldState) {
  const v=worldVisuals.get(world);return {players:v?.players.size??0,species:v?.species.size??0,drops:v?.drops.size??0,petals:v?.petals.size??0};
}

/** Original fillRectangle emits a transformed unit rectangle and caches its
 * matrix. Keep zero-sized rectangles: they are part of the Canvas contract. */
function drawArena(context: Canvas2DContext, world: WorldState, camera: CameraState, now: number, level: number, menuPreview: boolean): void {
  const width = camera.viewportWidth, height = camera.viewportHeight;
  const ratio = camera.pixelRatio, zoom = f(camera.zoom);
  let matrix = [1, 0, 0, 1, 0, 0];
  const rectangle = (x: number, y: number, w: number, h: number): void => {
    const next = [w * ratio, 0, 0, h * ratio, x * ratio, y * ratio];
    if (next.some((value, index) => value !== matrix[index])) {
      context.setTransform(next[0], next[1], next[2], next[3], next[4], next[5]);
      matrix = next;
    }
    context.fillRect(0, 0, 1, 1);
  };
  const projectX = (x: number): number => f(width * 0.5 + f(f(x - f(camera.x)) * zoom));
  const projectY = (y: number): number => f(height * 0.5 + f(f(y - f(camera.y)) * zoom));
  const clampX = (x: number): number => Math.max(0, Math.min(width, projectX(x)));
  context.setGlobalCompositeOperation?.('source-over');
  // clientFrame clears the menu's 1x1 renderer before func763. Its visible
  // background has already been submitted to the main canvas, so this pass
  // begins with the arena bands, preserving the renderer's identity matrix.
  if (!menuPreview) {
    context.setFillRgb(30, 167, 97);
    rectangle(0, 0, width, height);
  }
  context.save();
  context.save();
  const stops = [f(f(ARENA_WIDTH * f(0.3)) - ARENA_WIDTH / 2),
    f(f(ARENA_WIDTH * f(0.6)) - ARENA_WIDTH / 2),
    f(f(ARENA_WIDTH * f(0.9)) - ARENA_WIDTH / 2)];
  const colors = [[30, 167, 97], [222, 207, 124], [176, 102, 85], [77, 94, 86]];
  let left = 0;
  for (let index = 0; index < colors.length; index++) {
    const color = colors[index];
    context.setFillRgb(color[0], color[1], color[2]);
    const right = index === stops.length ? width : clampX(stops[index]);
    if (right > left) rectangle(left, 0, f(right - left), height);
    left = right;
  }
  // Native boundary scalars belong to the render session. Metadata creates
  // the control record before a player body exists, so hidden menu passes
  // already advance these values and the gameplay camera inherits them.
  let boundary = arenaBoundaries.get(world);
  if (boundary === undefined || now < boundary.at)
    boundary = { left: 0, right: 0, top: 0, bottom: 0, level: -ARENA_WIDTH / 2, at: now };
  const elapsed = Math.max(0, now - boundary.at);
  const ease = (value: number, target: number): number => f(f(f(value * 4) + target) * f(0.2));
  if (world.lastSequence > 0) {
    boundary.left = ease(boundary.left, -ARENA_WIDTH / 2);
    boundary.right = ease(boundary.right, ARENA_WIDTH / 2);
    boundary.top = ease(boundary.top, -ARENA_HEIGHT / 2);
    boundary.bottom = ease(boundary.bottom, ARENA_HEIGHT / 2);
  }
  boundary.at = now;
  arenaBoundaries.set(world, boundary);
  const l = Math.max(0, projectX(boundary.left));
  const r = Math.min(width, projectX(boundary.right));
  const t = Math.max(0, projectY(boundary.top));
  const b = Math.min(height, projectY(boundary.bottom));
  context.save();
  context.setGlobalAlpha(0.1);
  context.setFillRgb(0, 0, 0);
  rectangle(0, t, l, f(height - t));
  rectangle(0, 0, r, t);
  rectangle(r, 0, f(width - r), b);
  rectangle(l, b, f(width - l), f(height - b));
  // The renderer rounds the level-band boundary to the nearest 50 units,
  // halfway away from zero; the HUD eases its world coordinate.
  const fraction = level < 15 ? undefined : level < 30 ? f(0.3) : level < 45 ? f(0.6) : f(0.9);
  const grid = fraction === undefined ? -ARENA_WIDTH / 100
    : f(f(ARENA_WIDTH * fraction - ARENA_WIDTH / 2) * f(0.02));
  const targetLevel = Math.max(-ARENA_WIDTH / 2, f(Math.sign(grid) * Math.floor(Math.abs(grid) + 0.5) * 50));
  boundary.level = Math.abs(boundary.level - targetLevel) < 1e-7 ? targetLevel
    : f(boundary.level + (targetLevel - boundary.level) * Math.max(0, Math.min(1, 1 - Math.pow(0.8, f(elapsed) * 0.06))));
  const levelLeft = Math.max(0, projectX(-ARENA_WIDTH / 2));
  rectangle(levelLeft, Math.max(0, projectY(-ARENA_HEIGHT / 2)), f(Math.max(0, projectX(boundary.level)) - levelLeft),
    f(Math.min(height, projectY(ARENA_HEIGHT / 2)) - Math.max(0, projectY(-ARENA_HEIGHT / 2))));
  context.restore();
}

/** One recovered entity block: a save/restore pair around a single
 * screen-space setTransform, followed by local-coordinate artwork. */
interface VisibleEntity {
  entity: EntityState;
  x: number;
  y: number;
  angle: number;
  radius: number;
  screenX: number;
  screenY: number;
}

const speciesOf = (entity: EntityState): number => entity.speciesId ?? entity.typeId;

/** Declaration ordinals in renderer priority order.
 * The domain's identity component is metadata, so only projectile/petal
 * declarations select these models. A species id cannot distinguish them. */
function petalRenderComponent(entity: EntityState): number {
  if (entity.kind !== 3 && entity.kind !== 5) return 0;
  const mask = entity.componentMask ?? 0;
  for (const [ordinal, offset] of [[18,108],[5,68],[7,76],[12,92]])
    if (mask & (1 << (ordinal-1))) return offset;
  return entity.kind === 3 ? 76 : 108;
}

/** Entities that belong to the static background layer in the archived
 * renderer: rocks, boulders, cacti, ant holes and squares. */
function isBackgroundEntity(entity: EntityState): boolean {
  const species = speciesOf(entity);
  return species === 1 || species === 2 || species === 3 || species === 11 || species === 19;
}

function drawLayer(entity: EntityState): number {
  if (entity.kind === 4) return 0;
  if (petalRenderComponent(entity) === 92) return 1;
  if (entity.kind === 3) return 2;
  if (entity.kind === 1) return 4;
  if (isBackgroundEntity(entity)) return 1;
  return 3;
}

/** Original garden grid: 50-world-unit cells, black at alpha 0.06, drawn in
 * screen space over the background. The archived client emits one path with
 * every vertical then every horizontal line. */
function drawGrid(context: Canvas2DContext, camera: CameraState): void {
  const ratio = camera.pixelRatio;
  const width = camera.viewportWidth;
  const height = camera.viewportHeight;
  const zoom = Math.fround(camera.zoom);
  if (!(zoom > 0)) return;
  const step = Math.fround(50 * zoom);
  if (!(step >= 2)) return;
  // function_763 projects the camera centre through f32 *before* taking
  // fmod. Rewriting this as (gridWorld - origin) * zoom loses the original
  // rounding at large world coordinates and shifts every grid edge.
  const phase = (centre: number, extent: number): number => {
    const projected = Math.fround(extent * 0.5 - Math.fround(zoom * Math.fround(centre)));
    return Math.fround((projected % step + step) % step);
  };
  const startX = phase(camera.x, width);
  const startY = phase(camera.y, height);
  const endX = Math.trunc(Math.fround(Math.fround(width + step) + 1));
  const endY = Math.trunc(Math.fround(Math.fround(height + step) + 1));
  context.save();
  context.setStrokeRgb(0, 0, 0);
  context.setGlobalAlpha(Math.fround(zoom * Math.fround(0.1)));
  // The archived client keeps the 30.010254 px step and emits every line at
  // `start + 0.5`: the half-pixel offset is what makes a 1 px stroke cover both
  // neighbouring pixels (golden frame 59 first line 27.796 = 27.297 + 0.5).
  // It never emits a lineWidth setter (the default 1 is used).
  context.beginPath();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (let x = startX; x < endX; x = Math.fround(x + step)) {
    context.moveTo(x + 0.5, 0.5);
    context.lineTo(x + 0.5, endY + 0.5);
  }
  for (let y = startY; y < endY; y = Math.fround(y + step)) {
    context.moveTo(0.5, y + 0.5);
    context.lineTo(endX + 0.5, y + 0.5);
  }
  context.stroke();
  context.restore();
}

function collectVisible(
  world: WorldState,
  camera: CameraState,
  now: number,
  frame:FrameContext,
  playerPosition?:{x:number;y:number},
): VisibleEntity[] {
  frame.stats.worldScans++; // Culling visits the complete cached membership.
  const zoom = camera.zoom;
  const width = camera.viewportWidth;
  const height = camera.viewportHeight;
  let buffers=visibleBuffers.get(world);
  if(!buffers){buffers={items:[],pool:[]};visibleBuffers.set(world,buffers);}
  const visible=buffers.items;visible.length=0;
  const view=worldViewportBounds(camera),roundedZoom=f(zoom);
  const rootX = f(width * 0.5 - f(f(camera.x) * f(zoom)));
  const rootY = f(height * 0.5 - f(f(camera.y) * f(zoom)));
  for (const handle of frame.orderedHandles) {
    if(!world.isRenderable(handle))continue;
    const entity=world.get(handle)!;
    const transform = frame.transform(entity, now);
    // The archived local-player block is drawn with the mouse-pan/shake offset;
    // other entities use the unshifted world projection.
    const panX = entity.kind === 1 ? camera.entityOffsetX : 0;
    const panY = entity.kind === 1 ? camera.entityOffsetY : 0;
    const radius = transform.radius ?? 20;
    // The controlled flower is constrained after interpolation, before local
    // translation. The renderer composes rootTx + f32(localX * zoom), rather
    // than subtracting two large world coordinates before multiplication.
    const controlled = entity.kind === 1
      ? (entity.handle === frame.player?.handle ? playerPosition : undefined) ?? playerWorldPosition(entity, now, { x: camera.panX, y: camera.panY })
      : transform;
    const { x, y } = controlled;
    if (isOutsideWorldBounds(x, y, radius, view)) continue;
    const screenX = f(rootX + f(x * roundedZoom)) + panX;
    const screenY = f(rootY + f(y * roundedZoom)) + panY;
    let item=buffers.pool[visible.length];
    if(!item)buffers.pool.push(item={entity,x,y,angle:transform.angle,radius,screenX,screenY});
    else {item.entity=entity;item.x=x;item.y=y;item.angle=transform.angle;item.radius=radius;item.screenX=screenX;item.screenY=screenY;}
    visible.push(item);
  }
  frame.stats.visible=visible.length;
  return visible;
}

function setEntityTransform(
  context: Canvas2DContext,
  camera: CameraState,
  screenX: number,
  screenY: number,
  angle: number,
  rotate: boolean,
): void {
  const scale = f(camera.zoom) * camera.pixelRatio;
  const cosine = rotate ? f(Math.cos(f(angle))) : 1;
  const sine = rotate ? f(Math.sin(f(angle))) : 0;
  context.setTransform(
    f(scale * cosine),
    f(scale * sine),
    f(-scale * sine),
    f(scale * cosine),
    screenX * camera.pixelRatio,
    screenY * camera.pixelRatio,
  );
}

function drawEntityBlock(
  context: Canvas2DContext,
  camera: CameraState,
  item: VisibleEntity,
  now: number,
  deltaMs: number,
  playerVisual: PlayerVisual | undefined,
  flash: number,
  animation: SpeciesAnimationState,
  dropVisual: DropVisualState | undefined,
  petalVisual: PetalVisual,
  randomAngle: () => number,
): void {
  const { entity } = item;
  const species = speciesOf(entity);
  const radius = item.radius;
  context.save();
  const fadeAt = (entity.visualFlags ?? 0) & 1 ? entity.fadingAt : undefined;
  const fade = fadeAt === undefined ? 0
    : f(Math.max(0, Math.min(1, (now - fadeAt) / 150)));
  if (fadeAt !== undefined) context.setGlobalAlpha((context.getGlobalAlpha?.() ?? 1) * (1 - fade));
  const rotate = species !== 1 && species !== 2 && species !== 3 && species !== 19
    && entity.kind !== 4;
  setEntityTransform(context, camera, item.screenX, item.screenY, item.angle, rotate);
  if (fadeAt !== undefined) context.transform?.(f(1 + fade), 0, 0, f(1 + fade), 0, 0);
  const renderComponent = petalRenderComponent(entity);
  if (renderComponent === 108) drawHornetMissile(context,flash);
  else if (renderComponent === 68) {
    const flags = entity.byteFields?.[9] ?? entity.denseByteFields?.[9] ?? entity.denseFields?.[9] ?? 0;
    drawLaunchedPea(context,species,flash,typeof flags === 'number' ? flags : 0);
  } else if (renderComponent === 92) {
    const progress = petalVisual.webProgress;
    petalVisual.webProgress = f(Math.abs(progress-1) < 1e-7 ? 1
      : progress+(1-progress)*(1-Math.pow(0.7,f(deltaMs)*0.06)));
    drawGroundWeb(context,petalVisual.webProgress);
  } else {
  switch (entity.kind) {
    case 1:
      const field = (index: number): number => {
        const value = entity.byteFields?.[index] ?? entity.denseByteFields?.[index] ?? entity.denseFields?.[index];
        return typeof value === 'number' ? value : 0;
      };
      // Native player rendering reads ctor 756 (entity+144), protocol field
      // 14. These effect flags are independent of the field-31 expression
      // byte and field-22 pickup type.
      const actions = field(14);
      drawPlayerFace(context, {
        state: playerVisual?.face,
        deltaMs,
        lookAngle: field(2) * (2 * Math.PI / 255),
        attacking: (actions & 1) !== 0,
        defending: (actions & 2) !== 0,
        extraAction: (actions & 4) !== 0,
        expressionFlags: field(31),
        dead: entity.healthKnown && entity.health <= 0,
        flash,
      });
      break;
    case 3: {
      if (species === 35) drawUniqueTrail(context,petalVisual.trail,deltaMs,item.x,item.y,randomAngle);
      if ([11,12,34].includes(species)) petalVisual.phase = f(petalVisual.phase + f(deltaMs)*0.001);
      drawPetalInstance(context, species, radius, now, entity.handle, petalVisual.phase);
      if (species === 5) petalVisual.phase = f(petalVisual.phase + f(deltaMs)*0.0003);
      break;
    }
    case 4:
      drawDrop(context, entity.byteFields?.[22] ?? entity.denseByteFields?.[22]
        ?? (typeof entity.denseFields?.[22] === 'number' ? entity.denseFields[22] : undefined) ?? species,
        14, Infinity, dropVisual);
      break;
    default:
      // Entity-table artwork seeds use the packed index/generation handle;
      // the network-facing domain table keeps its rotated wire encoding.
      const artworkSeed = ((entity.handle << 14) | (entity.handle >>> 18)) >>> 0;
      advanceSpeciesAnimation(animation, entity, item.x, item.y, deltaMs);
      const animationTime = species >= 7 && species <= 13 && species !== 11 ? animation.time : now;
      drawSpecies(context, species, artworkSeed, radius, animationTime, flash, animation);
      break;
  }
  }
  context.restore();
}

/** World pass: arena, grid, health bars, background, petals, mobs and player.
 * Each entity block is a save/restore pair around one screen-space transform,
 * matching the archived renderer's command structure. */
export function drawWorld(context: Canvas2DContext, world: WorldState, camera: CameraState, now: number,
                          options: { readonly menuPreview?: boolean;readonly frame?:FrameContext;readonly playerPosition?:{x:number;y:number};readonly deltaMs?:number } = {}): void {
  let frame=options.frame??frameContexts.get(world);
  if(!frame){frame=new FrameContext();frameContexts.set(world,frame);}
  frameContexts.set(world,frame);
  frame.begin(world,camera,now,options.deltaMs??16,drawLayer);
  const level = frame.level;
  drawArena(context, world, camera, now, level, options.menuPreview === true);
  drawGrid(context, camera);

  const visible = collectVisible(world, camera, now, frame,options.playerPosition);
  let visuals = worldVisuals.get(world);
  if (!visuals || now < visuals.at || visuals.epoch!==world.lifetimeRevision) {
    releaseWorldVisuals(world);
    visuals = { epoch:world.lifetimeRevision, at: now - 16, players: new Map(), species: new Map(),
    drops: new Map(), dropRandom: 1, petals: new Map(), randomAngle: createArtRandom() };
  }
  const deltaMs = Math.max(0, now - visuals.at);
  visuals.at = now;
  worldVisuals.set(world, visuals);
  // The archived pickup pass visits the whole component pool, including
  // offscreen drops. Retain its state while the camera moves away and back.
  for (const entity of world.entitiesOfKind(4)) {
    const pickupFlags = entity.byteFields?.[54] ?? entity.denseByteFields?.[54] ?? entity.denseFields?.[54] ?? 0;
    const collected = typeof pickupFlags === 'number' && (pickupFlags & 1) !== 0;
    let drop = visuals.drops.get(entity.handle);
    if (!drop) {
      visuals.dropRandom = visuals.dropRandom * 48271 % 2147483647;
      const phase = f(f(f(visuals.dropRandom - 1) * 9.313225884932663e-11) - 0.10000000149011612);
      drop = createDropVisualState(now, entity.arrivalMarked === true || (entity.flags & 128) !== 0 || collected, phase);
      visuals.drops.set(entity.handle, drop);
    }
    advanceDropVisualState(drop, now, deltaMs, collected);
  }
  for (const [handle,drop] of visuals.drops) if (!world.isRenderable(handle)) {
    const resources=renderResources(),owner=resources.dropLabelOwners.get(drop);
    if(owner!==undefined)releaseLabel(owner);
    resources.dropLabelOwners.delete(drop);if(!world.get(handle))visuals.drops.delete(handle);
  }
  const playerVisual = (handle: number): PlayerVisual => {
    let state = visuals!.players.get(handle);
    if (!state) { state = { face: createPlayerFaceState(), health: createPlayerHealthBarState(), fresh: true }; visuals!.players.set(handle, state); }
    return state;
  };
  for (const handle of visuals.players.keys())
    if (!world.get(handle)) visuals.players.delete(handle);
  for (const handle of visuals.species.keys())
    if (!world.get(handle)) visuals.species.delete(handle);
  for (const handle of visuals.petals.keys())
    if (!world.get(handle)) visuals.petals.delete(handle);

  // Health bars are the first entity layer in the archived frame.
  context.save();
  for (const player of visible) {
    if(player.entity.kind!==1)continue;
    const maxHealth = player.entity.maxHealth;
    const ratioHealth = player.entity.maxHealthKnown && maxHealth > 0
      ? player.entity.health / maxHealth
      : 1;
    setEntityTransform(context, camera, player.screenX, player.screenY, 0, false);
    const visual = playerVisual(player.entity.handle);
    drawPlayerHealthBar(context, ratioHealth, { state: visual.health, deltaMs, immediate: visual.fresh });
  }

  for (const item of visible) {
    const flash = world.hitFlash(item.entity.handle, now);
    let animation = visuals.species.get(item.entity.handle);
    if (!animation) {
      animation = createSpeciesAnimationState();
      visuals.species.set(item.entity.handle, animation);
    }
    let petal = visuals.petals.get(item.entity.handle);
    if (!petal) {
      petal = { phase: petalRenderComponent(item.entity) === 76 && [5,11,12,34].includes(speciesOf(item.entity))
        ? visuals.randomAngle() : 0,
        trail: createUniqueTrail(), webProgress: item.entity.arrivalMarked ? 0 : 1 };
      visuals.petals.set(item.entity.handle,petal);
    }
    frame.stats.drawn++;
    drawEntityBlock(context, camera, item, now, deltaMs,
      item.entity.kind === 1 ? playerVisual(item.entity.handle) : undefined, flash, animation,
      visuals.drops.get(item.entity.handle),petal,visuals.randomAngle);
    if (item.entity.kind === 1) playerVisual(item.entity.handle).fresh = false;
  }

  context.restore();
  context.restore();
  context.restore();
}
