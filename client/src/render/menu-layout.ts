/** Shared native menu geometry. All rectangles are logical client units; the
 * caller converts pointer coordinates with the same HUD scale. */
import { MOB_INFO, PETAL_INFO } from '../schema/petals.js';
import { MOB_GALLERY } from '../schema/mob-gallery.js';
import { CHANGELOG } from '../schema/menu-content.js';
import { measureLabel } from './canvas2d/text-cache.js';

const f = Math.fround;
export type MenuPanel = 'Settings' | 'Petals' | 'Mobs' | 'Changelog';

export interface MenuSettingsState {
  readonly keyboardMovement: boolean;
  readonly movementHelper: boolean;
}

export interface MenuRenderState {
  readonly panel?: MenuPanel;
  readonly panelAlphas?: Readonly<Record<MenuPanel, number>>;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly hoveredTab?: MenuPanel;
  readonly hoveredPetal?: number;
  readonly hoveredMob?: number;
  readonly petalTooltips?: readonly { readonly type: number; readonly alpha: number }[];
  readonly mobDropTooltips?: readonly { readonly mob: number; readonly index: number; readonly alpha: number }[];
  readonly respawnTooltips?: readonly { readonly index: number; readonly type: number; readonly alpha: number }[];
  readonly settings: MenuSettingsState;
  readonly discoveries: readonly number[];
  readonly mobs: readonly number[];
  readonly scroll: Readonly<Record<MenuPanel, number>>;
}

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

export const MENU_TABS: readonly MenuPanel[] = ['Settings', 'Petals', 'Mobs', 'Changelog'];
export const MENU_TAB_HEIGHT = 35;
export const MENU_TAB_WIDTHS: Readonly<Record<MenuPanel, number>> = {
  Settings: 100, Petals: 100, Mobs: 100, Changelog: 120,
};
export const MENU_PANEL_BOTTOM = 969;
/** Respawn row: 60-unit cards on a 70-unit pitch, centred under the input. */
export const MENU_RESPAWN_CARD_SIZE = 60;
export const MENU_RESPAWN_CARD_PITCH = 70;
/** Card centre, relative to half the logical viewport height. */
export const MENU_RESPAWN_CARD_Y = 114.5;
/** Native623 is called with (0, -40) in the card's local space. */
export const MENU_RESPAWN_TOOLTIP_Y = -40;

export function menuRespawnCardAnchor(index: number, count: number,
                                     width: number, height: number): { x: number; y: number } {
  const centerX = Math.trunc(width / 2);
  let x = f(centerX - f((count - 1) * MENU_RESPAWN_CARD_PITCH / 2));
  for (let i = 0; i < index; i++) x = f(x + MENU_RESPAWN_CARD_PITCH);
  return { x, y: f(height / 2 + MENU_RESPAWN_CARD_Y) };
}

export function menuRespawnCardRect(index: number, count: number,
                                    width: number, height: number): Rect {
  const anchor = menuRespawnCardAnchor(index, count, width, height);
  const half = MENU_RESPAWN_CARD_SIZE / 2;
  return { x: f(anchor.x - half), y: f(anchor.y - half),
    width: MENU_RESPAWN_CARD_SIZE, height: MENU_RESPAWN_CARD_SIZE };
}

export const MENU_PANEL_DIMENSIONS: Readonly<Record<MenuPanel, { x: number; width: number; height: number }>> = {
  Settings: { x: 10, width: 239.583878, height: 163.600006 },
  Petals: { x: 10, width: 336, height: 370 },
  Mobs: { x: 104.5, width: 351, height: 370 },
  Changelog: { x: 150, width: 500, height: 400 },
};

/** Original clientFrame places the tabs 45 logical units above the viewport
 * bottom, with ten-unit gaps between tabs. 1029 is the legacy 720px fixture. */
export function menuTabRect(panel: MenuPanel, height = 1029): Rect {
  let x = 10;
  for (const tab of MENU_TABS) {
    const width = MENU_TAB_WIDTHS[tab];
    if (tab === panel) return { x, y: height - 45, width, height: MENU_TAB_HEIGHT };
    x += width + 10;
  }
  return { x: 10, y: height - 45, width: 100, height: MENU_TAB_HEIGHT };
}

export function menuPanelRect(panel: MenuPanel, height: number, alpha = 1): Rect {
  const dimensions = MENU_PANEL_DIMENSIONS[panel];
  return { x: dimensions.x, y: f(height + 50 - (110 + dimensions.height) * alpha),
    width: dimensions.width, height: dimensions.height };
}

export function menuTabAt(x: number, y: number, height = 1029): MenuPanel | undefined {
  if (y < height - 45 || y > height - 10) return undefined;
  for (const tab of MENU_TABS) {
    const rect = menuTabRect(tab, height);
    if (x >= rect.x && x <= rect.x + rect.width) return tab;
  }
  return undefined;
}

export function menuCloseRect(panel: MenuPanel, height: number, alpha = 1): Rect {
  const rect = menuPanelRect(panel, height, alpha);
  return { x: panel === 'Settings' ? rect.x + 185 : rect.x + rect.width - 35, y: f(rect.y + 14.3), width: 25, height: 25 };
}

export function menuContentRect(panel: MenuPanel, height: number, alpha = 1): Rect {
  const rect = menuPanelRect(panel, height, alpha);
  return { x: rect.x + 10, y: f(rect.y + f(63.6)), width: rect.width - 20, height: f(rect.height - f(73.6)) };
}

export function settingsCheckboxRect(row: number, height: number, alpha = 1): Rect {
  const content = menuContentRect('Settings', height, alpha);
  return { x: content.x + 5, y: f(content.y + 5 + row * 45), width: 25, height: 25 };
}

export function settingsRowAt(x: number, y: number, height: number, alpha = 1): number | undefined {
  for (let row = 0; row < 2; ++row) {
    const rect = settingsCheckboxRect(row, height, alpha);
    if (x >= rect.x - 10 && x <= rect.x + 160 && y >= rect.y - 10 && y <= rect.y + rect.height + 10) return row;
  }
  return undefined;
}

export const PETAL_GRID = { columns: 4, cell: 60, gap: 10, topInset: 5, leftInset: 15 } as const;
export const PETAL_GALLERY_TYPES: readonly number[] = Object.keys(PETAL_INFO).map(Number).filter(Boolean)
  .sort((a, b) => PETAL_INFO[a].rarity - PETAL_INFO[b].rarity || compareName(PETAL_INFO[a].name, PETAL_INFO[b].name) || a - b);

function compareName(a: string, b: string): number { return a < b ? -1 : +(a > b); }

export function petalCellRect(index: number, height: number, alpha = 1): Rect {
  const content = menuContentRect('Petals', height, alpha);
  const column = index % PETAL_GRID.columns;
  const row = Math.floor(index / PETAL_GRID.columns);
  const remaining = Math.min(PETAL_GRID.columns, PETAL_GALLERY_TYPES.length - row * PETAL_GRID.columns);
  return { x: content.x + PETAL_GRID.leftInset + (PETAL_GRID.columns - remaining) * 35 + column * (PETAL_GRID.cell + PETAL_GRID.gap),
    y: content.y + PETAL_GRID.topInset + row * (PETAL_GRID.cell + PETAL_GRID.gap),
    width: PETAL_GRID.cell, height: PETAL_GRID.cell };
}

export function petalCellAt(x: number, y: number, height: number, scroll: number, alpha = 1): number | undefined {
  const content = menuContentRect('Petals', height, alpha);
  if (x < content.x || x > content.x + content.width || y < content.y || y > content.y + content.height) return undefined;
  const localY = y - content.y - PETAL_GRID.topInset + scroll;
  const row = Math.floor(localY / (PETAL_GRID.cell + PETAL_GRID.gap));
  const remaining = Math.min(PETAL_GRID.columns, PETAL_GALLERY_TYPES.length - row * PETAL_GRID.columns);
  const localX = x - content.x - PETAL_GRID.leftInset - (PETAL_GRID.columns - remaining) * 35;
  const column = Math.floor(localX / (PETAL_GRID.cell + PETAL_GRID.gap));
  if (column < 0 || column >= PETAL_GRID.columns || row < 0) return undefined;
  const inX = localX - column * (PETAL_GRID.cell + PETAL_GRID.gap);
  const inY = localY - row * (PETAL_GRID.cell + PETAL_GRID.gap);
  if (inX > PETAL_GRID.cell || inY > PETAL_GRID.cell) return undefined;
  const gridIndex = row * PETAL_GRID.columns + column;
  return gridIndex < PETAL_GALLERY_TYPES.length ? gridIndex : undefined;
}

export const MOB_GALLERY_TYPES: readonly number[] = Object.keys(MOB_GALLERY).map(Number).filter(id => id !== 16 && id !== 18)
  .sort((a, b) => MOB_GALLERY[a].rarity - MOB_GALLERY[b].rarity || compareName(MOB_INFO[a].name, MOB_INFO[b].name) || a - b);

/** Original multiline labels wrap the glyph advances before adding the outline. */
export function wrapMenuText(value: string, font: number, maxWidth: number): readonly string[] {
  const result: string[] = [];
  for (const paragraph of value.split('\n')) {
    if (!paragraph) { result.push(''); continue; }
    let start = 0;
    while (start < paragraph.length) {
      // Native1058 upper-bounds prefix lengths, then retreats to a space or
      // to the character immediately after comma, hyphen or period.
      let first = start, count = paragraph.length - start;
      while (count) {
        const half = count >> 1, middle = first + half;
        if (measureLabel(paragraph.slice(start, middle), font) > maxWidth) count = half;
        else { first = middle + 1; count -= half + 1; }
      }
      let end = first;
      if (end !== paragraph.length) {
        while (end > start && paragraph[end] !== ' ' && !',-.'.includes(paragraph[end - 1])) end--;
        if (end === start) {
          end = start;
          while (end < paragraph.length && paragraph[end] !== ' ') {
            end++;
            if (',-.'.includes(paragraph[end - 1])) break;
          }
        }
      }
      result.push(paragraph.slice(start, end));
      start = end;
      while (paragraph[start] === ' ') start++;
    }
  }
  return result;
}

export function mobDescriptionLines(type: number): readonly string[] {
  return wrapMenuText(MOB_INFO[type].description, 14, 220 - 6);
}

export function mobRowHeight(type: number, discovered: boolean): number {
  if (!discovered) return f(f(18 * 1.4) + 20);
  const textHeight = f(f(f(18 * 1.4) + f(14 * 1.4)) + f(5 + f(mobDescriptionLines(type).length * f(14 * 1.4))));
  return f(20 + f(Math.max(60, textHeight) + 10 + Math.ceil(MOB_GALLERY[type].drops.length / 6) * 62));
}

export function mobRowRect(index: number, height: number, discovered: readonly number[] = []): Rect {
  const content = menuContentRect('Mobs', height);
  let y = f(content.y + 5);
  for (let i = 0; i < index; i++) y = f(y + f(mobRowHeight(MOB_GALLERY_TYPES[i], discovered.includes(MOB_GALLERY_TYPES[i])) + 10));
  return { x: content.x, y, width: 315, height: mobRowHeight(MOB_GALLERY_TYPES[index], discovered.includes(MOB_GALLERY_TYPES[index])) };
}

export function mobRowAt(x: number, y: number, height: number, scroll: number, discovered: readonly number[] = []): number | undefined {
  const content = menuContentRect('Mobs', height);
  if (x < content.x || x > content.x + content.width || y < content.y || y > content.y + content.height) return undefined;
  const index = MOB_GALLERY_TYPES.findIndex((_, index) => {
    const row = mobRowRect(index, height, discovered);
    return x >= row.x && x <= row.x + row.width && y + scroll >= row.y && y + scroll <= row.y + row.height;
  });
  return index >= 0 ? index : undefined;
}

export function mobDropRect(type: number, index: number, height: number, discovered: readonly number[]): Rect {
  const row = mobRowRect(MOB_GALLERY_TYPES.indexOf(type), height, discovered);
  const count = MOB_GALLERY[type].drops.length, columns = Math.min(6, count);
  const lastCount = count % columns || columns;
  const last = Math.floor(index / columns) === Math.ceil(count / columns) - 1;
  return { x: row.x + 10 + (last ? Math.trunc((columns - lastCount) * 49 / 2) : 0) + index % columns * 49,
    y: f(row.y + row.height - 10 - Math.ceil(count / columns) * 62 + Math.floor(index / columns) * 62), width: 49, height: 62 };
}

export function changelogEntries(): readonly { date: string; notes: readonly (readonly string[])[]; height: number }[] {
  return CHANGELOG.map(entry => {
    // The native scroll area reserves 16 units, each entry 20, and the
    // bullet and multiline label each retain their six-unit outline margin.
    const notes = entry.notes.map(note => wrapMenuText(note, 14, 480 - 16 - 20 - measureLabel('-', 14) - 12));
    return { date: entry.date, notes, height: f(68 + notes.reduce((sum, lines) => f(sum + f(lines.length * f(19.6))), 0)) };
  });
}

export function menuScrollMax(panel: MenuPanel, height: number, discoveredMobs: readonly number[] = []): number {
  if (panel === 'Petals') return Math.max(0, 10 * 70 + 10 - menuContentRect(panel, height).height);
  if (panel === 'Mobs') return Math.max(0, MOB_GALLERY_TYPES.reduce((sum, id) => f(sum + mobRowHeight(id, discoveredMobs.includes(id)) + 10), 0) - menuContentRect(panel, height).height);
  if (panel === 'Changelog') {
    const content = menuContentRect(panel, height);
    return Math.max(0, f(changelogEntries().reduce((sum, entry) => f(sum + entry.height), 0) + f(14 * 1.4 + 10)) - content.height);
  }
  return 0;
}
