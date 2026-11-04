import { PetalVariantFlag } from '../../schema/state-flags.js';
import { PETAL_INFO } from '../../schema/petals.js';
import { PetalId } from '../../schema/catalog-ids.js';
import type { Canvas2DContext } from '../canvas2d/context.js';
import { inLocal } from './geometry.js';
import { Rgb, TAU, flashColor, rgb, setFill, setStroke, shade } from './palette.js';
import { rockPoints } from './species.js';
// ---------------------------------------------------------------------------
// Petals and drops
// ---------------------------------------------------------------------------
/** Native catalogue colours, independent of rarity (rarity colours the tile). */
export const petalColors: Readonly<Record<number, Rgb>> = {
  [PetalId.BasicCommon]: rgb(255, 255, 255),
  [PetalId.FastCommon]: rgb(255, 255, 255),
  [PetalId.HeavyCommon]: rgb(187, 187, 187),
  [PetalId.RockRare]: rgb(119, 119, 119),
  [PetalId.SquareUnique]: rgb(255, 232, 105),
  [PetalId.RoseUnusual]: rgb(255, 148, 201),
  [PetalId.StingerUnusual]: rgb(51, 51, 51),
  [PetalId.IrisUnusual]: rgb(206, 118, 219),
  [PetalId.WingRare]: rgb(255, 255, 255),
  [PetalId.MissileRare]: rgb(51, 51, 51),
  [PetalId.PeasRare]: rgb(138, 194, 85),
  [PetalId.PeasEpic]: rgb(206, 118, 219),
  [PetalId.CactusRare]: rgb(56, 199, 95),
  [PetalId.FasterRare]: rgb(254, 255, 201),
  [PetalId.RoseEpic]: rgb(255, 148, 201),
  [PetalId.TwinUnusual]: rgb(255, 255, 255),
  [PetalId.TripletEpic]: rgb(255, 255, 255),
  [PetalId.BubbleRare]: rgb(255, 255, 255),
  [PetalId.PollenEpic]: rgb(255, 231, 99),
  [PetalId.DandelionRare]: rgb(255, 255, 255),
  [PetalId.CactusEpic]: rgb(180, 56, 199),
  [PetalId.EggEpic]: rgb(255, 240, 184),
  [PetalId.EggLegendary]: rgb(255, 240, 184),
  [PetalId.RoseRare]: rgb(255, 148, 201),
  [PetalId.AntennaeLegendary]: rgb(51, 51, 51),
  [PetalId.HeaviestEpic]: rgb(51, 51, 51),
  [PetalId.StingerLegendary]: rgb(51, 51, 51),
  [PetalId.YinYangEpic]: rgb(255, 255, 255),
  [PetalId.WebRare]: rgb(255, 255, 255),
  [PetalId.WebLegendary]: rgb(255, 255, 255),
  [PetalId.HoneyRare]: rgb(247, 207, 47),
  [PetalId.LeafUnusual]: rgb(57, 181, 74),
  [PetalId.CactusLegendary]: rgb(56, 199, 95),
  [PetalId.PeasLegendary]: rgb(206, 118, 219),
  [PetalId.BasicUnique]: rgb(255, 255, 255),
  [PetalId.SaltRare]: rgb(255, 255, 255),
  [PetalId.RiceEpic]: rgb(255, 255, 255),
  [PetalId.CornEpic]: rgb(255, 228, 25),
};
export function petalColor(type: number): Rgb {
  return petalColors[type] ?? rgb(255, 255, 255);
}
export function petalPaint(context: Canvas2DContext, type: number, width = 3): void {
  const color = petalColor(type);
  setFill(context, color);
  setStroke(context, shade(color));
  context.setLineWidth(width);
  context.fill();
  context.stroke();
}
export function petalDisc(
  context: Canvas2DContext,
  type: number,
  radius: number,
  x = 0,
  y = 0,
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  petalPaint(context, type);
}
export function petalPolygon(
  context: Canvas2DContext,
  radius: number,
  sides: number,
  inset = 1,
): void {
  context.beginPath();
  context.moveTo(radius, 0);
  for (let index = 1; index <= sides; index++) {
    const angle = (index * TAU) / sides;
    if (inset !== 1) {
      const middle = angle - Math.PI / sides;
      context.quadraticCurveTo(
        Math.cos(middle) * radius * inset,
        Math.sin(middle) * radius * inset,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    } else {
      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
  }
  context.closePath();
}
/** Recovered catalogue shapes. World instances and inventory icons have
 * different multiplicities (Twin/Triplet/Peas); neither is a generic disc.
 * Coordinates/colours are checked against the actual catalogue vtables in
 * client.wasm, not against the old eight-scene golden's social-media paths. */
export function drawPetalShape(
  context: Canvas2DContext,
  type: number,
  _icon: boolean,
  _now: number,
  seed = type,
  phase = _now * 0.001,
): void {
  switch (type) {
    case PetalId.RockRare:
    case PetalId.SaltRare: {
      // The original creates one irregular polygon per instance.
      const rock = type === PetalId.RockRare;
      const points = rockPoints(seed, rock ? 14 : 12, rock ? 5 : 7);
      context.beginPath();
      points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.closePath();
      context.setLineJoin('round');
      petalPaint(context, type);
      return;
    }
    case PetalId.SquareUnique:
      context.beginPath();
      context.rect(-10.60660171508789, -10.60660171508789, 21.21320343017578, 21.21320343017578);
      petalPaint(context, type, 2.250000089406967);
      return;
    case PetalId.StingerUnusual:
    case PetalId.StingerLegendary:
      petalPolygon(context, 7, 3);
      petalPaint(context, type);
      return;
    case PetalId.WingRare:
      inLocal(context, (local) => {
        local.beginPath();
        local.arc(0, 0, 15, -Math.PI / 2, Math.PI / 2);
        local.quadraticCurveTo(10, 0, 0, -15);
        local.closePath();
        petalPaint(local, type);
      });
      return;
    case PetalId.MissileRare:
      context.setLineJoin('round');
      context.beginPath();
      context.moveTo(11, 0);
      context.lineTo(-11, -6);
      context.lineTo(-11, 6);
      context.closePath();
      setFill(context, petalColor(type));
      setStroke(context, petalColor(type));
      context.setLineWidth(5);
      context.fill();
      context.stroke();
      return;
    case PetalId.PeasRare:
    case PetalId.PeasEpic:
    case PetalId.PeasLegendary: {
      // Native3628/3649/4283: diagonal offsets, independent fill/stroke per
      // pea, and a persistent random initial phase in the world. Native4283
      // uses radius 10 and offset 7 for the Legendary cluster.
      const legendary = type === PetalId.PeasLegendary;
      const offset = legendary ? 7 : 6,
        radius = legendary ? 10 : 7;
      inLocal(
        context,
        (local) => {
          for (const [x, y] of [
            [offset, offset],
            [-offset, offset],
            [offset, -offset],
            [-offset, -offset],
          ]) {
            inLocal(local, (pea) => petalDisc(pea, type, radius), 1, 0, x, y);
          }
        },
        1,
        _icon ? 0 : Math.fround(phase),
      );
      return;
    }
    case PetalId.CactusRare:
    case PetalId.CactusEpic:
    case PetalId.CactusLegendary:
      petalPolygon(context, 15, 8, 0.739103626);
      petalPaint(context, type);
      context.beginPath();
      context.arc(0, 0, 8, 0, TAU);
      setFill(context, type === PetalId.CactusEpic ? rgb(194, 116, 214) : rgb(116, 214, 143));
      context.fill();
      return;
    case PetalId.RoseEpic:
      context.beginPath();
      context.moveTo(10, 0);
      for (let index = 1; index <= 3; index++) {
        const angle = (index * TAU) / 3,
          mid = angle - Math.PI / 3;
        context.quadraticCurveTo(
          Math.cos(mid) * 20,
          Math.sin(mid) * 20,
          Math.cos(angle) * 10,
          Math.sin(angle) * 10,
        );
      }
      context.closePath();
      petalPaint(context, type);
      return;
    case PetalId.TwinUnusual:
    case PetalId.TripletEpic:
      petalDisc(context, type, 7);
      return;
    case PetalId.BubbleRare: {
      const alpha = context.getGlobalAlpha?.() ?? 1;
      context.setGlobalAlpha(alpha * 0.7);
      context.beginPath();
      context.arc(0, 0, 12, 0, TAU);
      context.setLineWidth(3);
      setStroke(context, rgb(255, 255, 255));
      context.stroke();
      context.setGlobalAlpha(alpha * 0.35);
      setFill(context, rgb(255, 255, 255));
      context.beginPath();
      context.arc(0, 0, 10.5, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(4, -4, 3, 0, TAU);
      context.fill();
      context.setGlobalAlpha(alpha);
      return;
    }
    case PetalId.DandelionRare:
      context.setLineCap('round');
      context.setLineWidth(7);
      setStroke(context, rgb(51, 51, 51));
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(-16, 0);
      context.stroke();
      petalDisc(context, type, 9);
      return;
    case PetalId.EggEpic:
    case PetalId.EggLegendary:
      context.beginPath();
      context.ellipse(
        0,
        0,
        type === PetalId.EggEpic ? 11 : 13,
        type === PetalId.EggEpic ? 15 : 17,
        0,
        0,
        TAU,
      );
      petalPaint(context, type);
      return;
    case PetalId.AntennaeLegendary:
      context.setLineJoin('round');
      context.setLineCap('round');
      inLocal(
        context,
        (local) => {
          for (const sign of [-1, 1]) {
            local.beginPath();
            local.moveTo(25, sign * 5);
            local.quadraticCurveTo(40, sign * 10, 50, sign * 15);
            local.quadraticCurveTo(40, sign * 5, 25, sign * 5);
            local.closePath();
            setFill(local, petalColor(type));
            setStroke(local, petalColor(type));
            local.setLineWidth(3);
            local.fill();
            local.stroke();
          }
        },
        1,
        -Math.PI / 2,
        0,
        35,
      );
      return;
    case PetalId.HeaviestEpic:
      petalDisc(context, type, 16);
      context.beginPath();
      context.arc(6, -6, 4.6, 0, TAU);
      setFill(context, rgb(204, 204, 204));
      context.fill();
      return;
    case PetalId.YinYangEpic:
      context.setLineCap('round');
      context.setLineWidth(3);
      context.beginPath();
      context.arc(0, 0, 12, 0, TAU);
      context.setFillRgb(255, 255, 255);
      context.fill();
      context.beginPath();
      context.arc(0, 0, 12, -Math.PI / 2, Math.PI / 2);
      setFill(context, rgb(51, 51, 51));
      context.fill();
      for (const [y, color] of [
        [6, 51],
        [-6, 255],
      ]) {
        context.beginPath();
        context.arc(0, y, 6, 0, TAU);
        context.setFillRgb(color, color, color);
        context.fill();
      }
      for (const [start, end, color] of [
        [-Math.PI / 2, 0, 41],
        [Math.PI / 2, -Math.PI / 2, 207],
        [0, Math.PI / 2, 41],
      ]) {
        context.beginPath();
        context.arc(0, 0, 12, start, end);
        context.setStrokeRgb(color, color, color);
        context.stroke();
      }
      for (const [y, start, end, color] of [
        [6, Math.PI / 2, -Math.PI / 2, 41],
        [-6, -Math.PI / 2, Math.PI / 2, 207],
      ]) {
        context.beginPath();
        context.arc(0, y, 6, start, end);
        context.setStrokeRgb(color, color, color);
        context.stroke();
      }
      return;
    case PetalId.WebRare:
    case PetalId.WebLegendary:
      petalPolygon(context, 11, 5, 0.4854101966);
      petalPaint(context, type);
      return;
    case PetalId.HoneyRare:
      petalPolygon(context, 11, 6);
      petalPaint(context, type);
      return;
    case PetalId.LeafUnusual:
      context.setLineCap('round');
      context.setLineWidth(3);
      setStroke(context, shade(petalColor(type)));
      context.beginPath();
      context.moveTo(-15, 0);
      context.lineTo(-20, 0);
      context.stroke();
      context.beginPath();
      context.moveTo(-15, 0);
      context.bezierCurveTo(-10, -12, 5, -12, 15, 0);
      context.bezierCurveTo(5, 12, -10, 12, -15, 0);
      context.closePath();
      petalPaint(context, type);
      context.beginPath();
      context.moveTo(-9, 0);
      context.quadraticCurveTo(0, -1.5, 7.5, 0);
      context.stroke();
      return;
    case PetalId.RiceEpic:
      context.setLineCap('round');
      context.beginPath();
      context.moveTo(-8, 0);
      context.quadraticCurveTo(0, -3, 8, 0);
      context.setLineWidth(10);
      context.setStrokeRgb(207, 207, 207);
      context.stroke();
      context.setLineWidth(4);
      context.setStrokeRgb(255, 255, 255);
      context.stroke();
      return;
    case PetalId.CornEpic:
      context.beginPath();
      context.moveTo(-5, 8);
      context.quadraticCurveTo(-15, -8, 0, -8);
      context.quadraticCurveTo(15, -8, 5, 8);
      context.quadraticCurveTo(0, 2, -5, 8);
      context.closePath();
      petalPaint(context, type);
      return;
    default:
      petalDisc(context, type, PETAL_INFO[type]?.radius ?? 10);
  }
}
export function drawPetalInstance(
  context: Canvas2DContext,
  type: number,
  radius = PETAL_INFO[type]?.radius ?? 10,
  now = 0,
  seed = type,
  phase?: number,
): void {
  if (!type || !PETAL_INFO[type]) {
    return;
  }
  const base = PETAL_INFO[type]?.radius ?? 10;
  const scale = Number.isFinite(radius) && radius > 0 ? radius / base : 1;
  const draw = (local: Canvas2DContext): void =>
    drawPetalShape(local, type, false, now, seed, phase);
  if (type === PetalId.WingRare) {
    inLocal(context, draw, scale, now * 0.01);
  } else if (type === PetalId.SquareUnique) {
    inLocal(context, draw, scale, phase ?? now * 0.0003);
  } else if (scale === 1) {
    draw(context);
  } else {
    inLocal(context, draw, scale);
  }
}
/** Native760 component+108. Hornet projectiles have their own fixed 1.3
 * transform, round caps/joins and 5-unit stroke, independent of collider size. */
export function drawHornetMissile(context: Canvas2DContext, flash = 0): void {
  inLocal(
    context,
    (local) => {
      local.setLineCap('round');
      local.setLineJoin('round');
      local.setLineWidth(5);
      const color = flashColor(rgb(51, 51, 51), flash);
      setFill(local, color);
      setStroke(local, color);
      local.beginPath();
      local.moveTo(11, 0);
      local.lineTo(-11, -6);
      local.lineTo(-11, 6);
      local.closePath();
      local.fill();
      local.stroke();
    },
    Math.fround(1.3),
  );
}
/** Split Peas use native760 component+68, not the catalogue cluster. */
export function drawLaunchedPea(
  context: Canvas2DContext,
  type: number,
  flash = 0,
  flags = type === PetalId.PeasLegendary ? 3 : type === PetalId.PeasEpic ? 1 : 0,
): void {
  const epic = (flags & PetalVariantFlag.EpicColor) !== 0;
  const large = (flags & PetalVariantFlag.Large) !== 0;
  const color = flashColor(petalColor(epic ? PetalId.PeasEpic : PetalId.PeasRare), flash);
  context.beginPath();
  context.arc(0, 0, large ? 10 : 7, 0, TAU);
  setFill(context, color);
  context.fill();
  setStroke(context, shade(color));
  context.setLineWidth(3);
  context.stroke();
}
/** Native760 component+92: five scalloped rings and thirteen 55-unit spokes.
 * The original caches this path in a 120-unit bitmap. Keep its actual geometry
 * here so a ground Web can never be scaled into a collider-sized Missile. */
export function drawGroundWeb(context: Canvas2DContext, progress = 1): void {
  const f = Math.fround,
    step = TAU / 13;
  inLocal(
    context,
    (local) => {
      local.setGlobalAlpha((local.getGlobalAlpha?.() ?? 1) * progress * 0.5);
      local.setLineJoin('round');
      local.setLineCap('round');
      local.setLineWidth(3);
      local.setStrokeRgb(255, 255, 255);
      local.beginPath();
      const point = (index: number, radius: number): readonly [number, number] => {
        const angle = f(index * step);
        return [f(f(Math.cos(angle)) * radius), f(f(Math.sin(angle)) * radius)];
      };
      for (let radius = 10; radius <= 50; radius += 10) {
        local.moveTo(radius, 0);
        for (let index = 0; index < 13; index++) {
          const a = point(index, radius),
            b = point(index + 1, radius);
          const x = f(a[0] + b[0]),
            y = f(a[1] + b[1]),
            length = f(Math.sqrt(x * x + y * y));
          local.quadraticCurveTo(
            f(f(x * 0.5) - f(f(x / length) * 5)),
            f(f(y * 0.5) - f(f(y / length) * 5)),
            b[0],
            b[1],
          );
        }
        local.closePath();
      }
      for (let index = 0; index < 13; index++) {
        local.moveTo(0, 0);
        local.lineTo(...point(index, 55));
      }
      local.stroke();
    },
    Math.fround(progress),
  );
}
export function drawPetalIcon(context: Canvas2DContext, type: number, scale = 1): void {
  const info = PETAL_INFO[type];
  if (!type || !info) {
    return;
  }
  const upright = new Set<number>([
    PetalId.SquareUnique,
    PetalId.WingRare,
    PetalId.MissileRare,
    PetalId.PeasRare,
    PetalId.PeasEpic,
    PetalId.DandelionRare,
    PetalId.WebRare,
    PetalId.WebLegendary,
    PetalId.PeasLegendary,
  ]);
  const angle = upright.has(type)
    ? 1
    : type === PetalId.LeafUnusual
      ? -1
      : type === PetalId.RiceEpic || type === PetalId.CornEpic
        ? 0.7
        : 0;
  if (info.instances === 1 && angle === 0 && scale === 1) {
    drawPetalShape(context, type, true, 0);
    return;
  }
  inLocal(
    context,
    (local) => {
      if (info.instances > 1) {
        for (let index = 0; index < info.instances; index++) {
          const phase = Math.fround((index * 6.283185) / info.instances);
          // Native587 translates the group first. Each catalogue visual then
          // applies its own icon rotation, preserving the cluster's orientation.
          inLocal(
            local,
            (part) => drawPetalShape(part, type, true, 0),
            1,
            angle,
            Math.fround(Math.fround(Math.cos(phase)) * 10),
            Math.fround(Math.fround(Math.sin(phase)) * 10),
          );
        }
      } else {
        inLocal(local, (part) => drawPetalShape(part, type, true, 0), 1, angle);
      }
    },
    scale,
  );
}
