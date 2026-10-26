/** Native menu panels (func1095), sharing geometry with pointer hit tests. */
import type { Canvas2DContext } from './canvas2d/context.js';
import { drawLabel, drawLabelBox, measureLabel } from './canvas2d/text-cache.js';
import { drawPetalCard, drawSpecies } from './entity-art.js';
import { MOB_INFO, RARITY_NAMES } from '../schema/petals.js';
import { MOB_GALLERY } from '../schema/mob-gallery.js';
import {
  MENU_TABS, MOB_GALLERY_TYPES, PETAL_GALLERY_TYPES, changelogEntries, mobDescriptionLines, mobDropRect,
  menuCloseRect, menuContentRect, menuPanelRect, menuScrollMax, mobRowRect, petalCellRect, settingsCheckboxRect,
  type MenuPanel, type MenuRenderState, type Rect,
} from './menu-layout.js';

const f = Math.fround;
export const RARITY_RGB: readonly (readonly [number, number, number])[] = [
  [126, 239, 109], [255, 230, 93], [94, 77, 227], [134, 31, 222], [222, 31, 31], [222, 31, 101],
];
export function rarityRgb(rarity: number): readonly [number, number, number] {
  return RARITY_RGB[rarity] ?? RARITY_RGB[0];
}
const hex = (color: readonly number[]): string => '#' + color.map(c => c.toString(16).padStart(2, '0')).join('');

function roundedRect(context: Canvas2DContext, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath(); context.moveTo(x + radius, y); context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height); context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius); context.quadraticCurveTo(x, y, x + radius, y); context.closePath();
}
function label(context: Canvas2DContext, value: string, font: number, x: number, top: number,
               raster: number, color = '#ffffff'): void {
  const margin = Math.trunc(f(f(font * .12) * 2)) * 2;
  drawLabelBox(context, { text: value, font, rasterScale: raster, fill: color },
    f(x), f(top), f(measureLabel(value, font) + margin), f(font * 1.4));
}
function drawPanelChrome(context: Canvas2DContext, panel: MenuPanel, height: number, raster: number): void {
  const rect = menuPanelRect(panel, height);
  context.setLineJoin('round'); context.setLineCap('round');
  context.setFillRgb(90, 159, 219); context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.setStrokeRgb(73, 129, 177); context.setLineWidth(7);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  const title = panel === 'Petals' ? 'Petal Gallery' : panel === 'Mobs' ? 'Mob Gallery' : panel;
  drawLabel(context, { text: title, font: 24, rasterScale: raster },
    f(rect.x + rect.width / 2 - (panel === 'Settings' ? 10 : 0)), f(rect.y + f(26.8)));
  const close = menuCloseRect(panel, height);
  context.setFillRgb(187, 85, 85); context.setStrokeRgb(151, 69, 69); context.setLineWidth(4);
  roundedRect(context, close.x, close.y, close.width, close.height, 4); context.fill(); context.stroke();
  context.setStrokeRgb(204, 204, 204); context.setLineWidth(3.75); context.beginPath();
  context.moveTo(close.x + 6.25, close.y + 6.25); context.lineTo(close.x + 18.75, close.y + 18.75);
  context.moveTo(close.x + 18.75, close.y + 6.25); context.lineTo(close.x + 6.25, close.y + 18.75); context.stroke();
}
function drawSettings(context: Canvas2DContext, state: MenuRenderState, height: number, raster: number): void {
  const rows = [['Keyboard movement', state.settings.keyboardMovement], ['Movement helper', state.settings.movementHelper]] as const;
  for (let row = 0; row < rows.length; row++) {
    const rect = settingsCheckboxRect(row, height);
    context.setFillRgb(102, 102, 102); context.setStrokeRgb(51, 51, 51); context.setLineWidth(4);
    context.beginPath(); context.rect(rect.x, rect.y, rect.width, rect.height); context.fill(); context.stroke();
    if (rows[row][1]) {
      context.setStrokeRgb(255, 255, 255); context.setLineWidth(4); context.beginPath();
      context.moveTo(rect.x + 4, rect.y + 13); context.lineTo(rect.x + 10, rect.y + 19);
      context.lineTo(rect.x + 21, rect.y + 5); context.stroke();
    }
    label(context, rows[row][0], 16, rect.x + 35, f(rect.y + 12.5 - f(16 * .7)), raster);
  }
}
function clip(context: Canvas2DContext, rect: Rect): void {
  context.beginPath(); context.rect(rect.x, rect.y, rect.width, rect.height); context.clip();
}
function card(context: Canvas2DContext, type: number, x: number, y: number, size: number, discovered: boolean, raster: number): void {
  context.save(); context.transform?.(1, 0, 0, 1, f(x), f(y));
  if (discovered) drawPetalCard(context, type, size);
  else {
    const alpha = context.getGlobalAlpha?.() ?? 1;
    roundedRect(context, -size / 2, -size / 2, size, size, size / 24);
    context.setGlobalAlpha(alpha * .25); context.setFillRgb(0, 0, 0); context.fill();
    context.setGlobalAlpha(alpha * .75);
    drawLabel(context, { text: '?', font: size * .4, rasterScale: raster }, 0, 0);
  }
  context.restore();
}
function drawPetalGallery(context: Canvas2DContext, state: MenuRenderState, height: number, raster: number): void {
  const content = menuContentRect('Petals', height);
  const max = menuScrollMax('Petals', height), scroll = Math.min(max, Math.max(0, state.scroll.Petals));
  context.save(); clip(context, content);
  for (const [index, type] of PETAL_GALLERY_TYPES.entries()) {
    const rect = petalCellRect(index, height), y = f(rect.y - scroll);
    if (y + rect.height < content.y || y > content.y + content.height) continue;
    card(context, type, rect.x + 30, y + 30, 60, state.discoveries.includes(type), raster);
  }
  context.restore(); drawScrollbar(context, content, scroll, max);
}
/** Portrait callbacks in the original use a fixed resting shape and a 225° pose. */
function portrait(context: Canvas2DContext, type: number, x: number, y: number): void {
  context.save(); roundedRect(context, x, y, 60, 60, 5);
  context.setFillRgb(90, 159, 219); context.fill(); context.clip();
  const c = f(-.707107);
  context.transform?.(c, c, -c, c, x + 30, y + 30);
  drawMobPortrait(context, type);
  context.restore();
}
/** The gallery's fixed callbacks differ from live mob radii and animation. */
export function drawMobPortrait(context: Canvas2DContext, type: number): void {
  const scale = type === 1 ? .6 : type === 2 ? .8 : type === 5 ? .7 : [3, 12, 15, 17].includes(type) ? .4 : .5;
  context.transform?.(scale, 0, 0, scale, 0, 0);
  const radius = type === 3 ? 50 : type === 12 || type === 13 ? 40 : 30;
  if (type === 12 || type === 13) context.transform?.(1, 0, 0, 1, -15, 0);
  if (type === 14) context.transform?.(1, 0, 0, 1, -10, 0);
  if (type === 15 || type === 17) {
    context.save(); context.transform?.(1, 0, 0, 1, -70, 0);
    drawSpecies(context, type + 1, 0, radius, 0); context.restore();
  }
  drawSpecies(context, type, 0, radius, 0);
}
function drawMobGallery(context: Canvas2DContext, state: MenuRenderState, height: number, raster: number): void {
  const content = menuContentRect('Mobs', height), max = menuScrollMax('Mobs', height, state.mobs);
  const scroll = Math.min(max, Math.max(0, state.scroll.Mobs));
  context.save(); clip(context, content);
  for (const [index, type] of MOB_GALLERY_TYPES.entries()) {
    const rect = mobRowRect(index, height, state.mobs), y = f(rect.y - scroll);
    if (y + rect.height < content.y || y > content.y + content.height) continue;
    roundedRect(context, rect.x, y, rect.width, rect.height, 5); context.setFillRgb(73, 129, 177); context.fill();
    if (!state.mobs.includes(type)) { label(context, '???', 18, rect.x + 10, y + 10, raster); continue; }
    label(context, MOB_INFO[type].name, 18, rect.x + 10, y + 10, raster);
    label(context, RARITY_NAMES[MOB_GALLERY[type].rarity], 14, rect.x + 10, f(y + 10 + f(18 * 1.4)), raster, hex(rarityRgb(MOB_GALLERY[type].rarity)));
    let lineY = f(y + 10 + f(f(18 * 1.4) + f(14 * 1.4)) + 5);
    for (const line of mobDescriptionLines(type)) { label(context, line, 14, rect.x + 10, lineY, raster); lineY = f(lineY + f(19.6)); }
    portrait(context, type, rect.x + rect.width - 70, y + 10);
    for (const [dropIndex, drop] of MOB_GALLERY[type].drops.entries()) {
      const cell = mobDropRect(type, dropIndex, height, state.mobs), cy = f(cell.y - scroll + 24.5), cx = cell.x + 24.5;
      card(context, drop.petalTypeId, cx, cy, 42, state.discoveries.includes(drop.petalTypeId), f(raster * .7));
      context.save(); context.transform?.(.7, 0, 0, .7, f(cx), cy);
      drawLabel(context, { text: formatDropChance(drop.chance), font: 14, rasterScale: f(raster * .7) }, 0, 45);
      context.restore();
    }
  }
  context.restore(); drawScrollbar(context, content, scroll, max);
}
export function formatDropChance(chance: number): string {
  const percent = chance * 100;
  const digits = percent > 0 ? Math.max(0, -Math.floor(Math.log10(percent))) : 0;
  return `${percent.toFixed(digits).replace(/^0\./, '.')}%`;
}
function drawChangelog(context: Canvas2DContext, state: MenuRenderState, height: number, raster: number): void {
  const content = menuContentRect('Changelog', height), max = menuScrollMax('Changelog', height);
  const scroll = Math.min(max, Math.max(0, state.scroll.Changelog));
  context.save(); clip(context, content);
  let y = f(content.y - scroll);
  for (const entry of changelogEntries()) {
    if (y > content.y + content.height) break;
    if (y + entry.height >= content.y) {
      label(context, entry.date, 20, content.x, y, raster);
      let lineY = f(y + 38);
      for (const lines of entry.notes) {
        label(context, '-', 14, content.x + 10, lineY, raster);
        for (const line of lines) {
          label(context, line, 14, content.x + 10 + measureLabel('-', 14) + 6, lineY, raster);
          lineY = f(lineY + f(19.6));
        }
      }
      context.setStrokeRgb(73, 129, 177); context.setLineWidth(7); context.setLineCap('round'); context.beginPath();
      context.moveTo(content.x + 5, f(lineY + 20)); context.lineTo(content.x + content.width - 21, f(lineY + 20)); context.stroke();
    }
    y = f(y + entry.height);
  }
  const footer = 'Older changelog entries not available';
  label(context, footer, 14, f(content.x + f((content.width - 16 - f(measureLabel(footer, 14) + 6)) * .5)), y, raster);
  context.restore(); drawScrollbar(context, content, scroll, max);
}
function drawScrollbar(context: Canvas2DContext, content: Rect, scroll: number, max: number): void {
  if (max <= 0) return;
  const track = f(content.height - 8), thumb = f(track * f(content.height / (content.height + max)));
  const y = f(content.y + 4 + f((track - thumb) * (scroll / max)));
  context.save(); context.setGlobalAlpha((context.getGlobalAlpha?.() ?? 1) * .2);
  context.setStrokeRgb(0, 0, 0); context.setLineWidth(8); context.setLineCap('round'); context.beginPath();
  context.moveTo(content.x + content.width - 4, y); context.lineTo(content.x + content.width - 4, f(y + thumb)); context.stroke(); context.restore();
}
export function drawMenuPanels(context: Canvas2DContext, state: MenuRenderState, height: number, raster: number): void {
  for (const panel of MENU_TABS) {
    const alpha = state.panelAlphas?.[panel] ?? +(state.panel === panel);
    if (alpha <= 0) continue;
    context.save(); context.setGlobalAlpha((context.getGlobalAlpha?.() ?? 1) * alpha);
    context.transform?.(1, 0, 0, 1, 0, f(menuPanelRect(panel, height, alpha).y - menuPanelRect(panel, height).y));
    drawPanelChrome(context, panel, height, raster);
    if (panel === 'Settings') drawSettings(context, state, height, raster);
    else if (panel === 'Petals') drawPetalGallery(context, state, height, raster);
    else if (panel === 'Mobs') drawMobGallery(context, state, height, raster);
    else drawChangelog(context, state, height, raster);
    context.restore();
  }
}
