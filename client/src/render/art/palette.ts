import type { Canvas2DContext } from '../canvas2d/context.js';
export const TAU = Math.PI * 2;
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
export const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });
export const PALETTES = Object.freeze({
  playerFace: rgb(255, 231, 99),
  playerOutline: rgb(207, 187, 80),
  playerInk: rgb(34, 34, 34),
  playerEyeLight: rgb(238, 238, 238),
  ladybugBody: rgb(235, 64, 52),
  ladybugOutline: rgb(190, 52, 42),
  ladybugDark: rgb(17, 17, 17),
  ladybugDarkOutline: rgb(14, 14, 14),
  beeBody: rgb(255, 231, 99),
  beeOutline: rgb(211, 189, 70),
  beeDark: rgb(51, 51, 51),
  beeDarkOutline: rgb(41, 41, 41),
  hornetBody: rgb(255, 211, 99),
  hornetOutline: rgb(211, 173, 70),
  antBody: rgb(85, 85, 85),
  antOutline: rgb(69, 69, 69),
  antLegs: rgb(41, 41, 41),
  rockBody: rgb(119, 119, 119),
  rockOutline: rgb(96, 96, 96),
  cactusBody: rgb(50, 168, 82),
  cactusOutline: rgb(40, 136, 66),
  cactusSpike: rgb(200, 230, 160),
  petalBasic: rgb(255, 255, 255),
  petalBasicOutline: rgb(207, 207, 207),
  healGreen: rgb(117, 221, 52),
  healRed: rgb(221, 52, 52),
  healBack: rgb(51, 51, 51),
});
export const setFill = (context: Canvas2DContext, color: Rgb): void => {
  context.setFillRgb(color.r, color.g, color.b);
};
export const setStroke = (context: Canvas2DContext, color: Rgb): void => {
  context.setStrokeRgb(color.r, color.g, color.b);
};
/** Remaining hit blend, 1 at impact and 0 after 150 ms. The first 15 ms
* are white, followed by red. Channels are truncated to f32. */
export function flashColor(base: Rgb, amount: number): Rgb {
  if (!(amount > 0))
    return base;
  const f = Math.fround;
  const weight = f(Math.min(1, amount));
  const target = weight >= 0.9 ? rgb(255, 255, 255) : rgb(255, 0, 0);
  const blend = (value: number, to: number): number => Math.trunc(f(f(f(1 - weight) * value) + f(weight * to)));
  return rgb(blend(base.r, target.r), blend(base.g, target.g), blend(base.b, target.b));
}
/** Darkened outline colour used by the original `sqrt(channel / 255) * 0.9`
* shading pass; kept as a helper so outlines track their body palette. */
export function shade(color: Rgb, scale = 0.8999999985098839): Rgb {
  const channel = (value: number): number => {
    const normalized = Math.sqrt(Math.max(0, value) / 255) * scale;
    return Math.round(normalized * normalized * 255);
  };
  return rgb(channel(color.r), channel(color.g), channel(color.b));
}
