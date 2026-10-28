/** Canvas-native menu state and hit testing. The only remaining DOM control is
 * the flower-name input, which needs real text editing and IME support. */
import { MOB_INFO, PETAL_INFO } from '../schema/petals.js';
import { MOB_GALLERY } from '../schema/mob-gallery.js';
import type { MenuInputPresentation } from '../render/menu-animation.js';
import {
  MENU_TABS, PETAL_GALLERY_TYPES, MOB_GALLERY_TYPES, menuCloseRect, menuContentRect, menuPanelRect, menuScrollMax, menuTabAt,
  menuRespawnCardRect,
  petalCellAt, mobRowAt, mobDropRect, settingsRowAt,
  type MenuPanel, type MenuRenderState,
} from '../render/menu-layout.js';

const f = Math.fround;

function storage(key: string): string | undefined {
  try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
}
function store(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* optional persistence */ }
}

export class MenuControls {
  readonly root = document.createElement('div');
  readonly name = document.createElement('input');
  panel: MenuPanel | undefined;
  keyboardMovement = false;
  movementHelper = false;
  private readonly discoveries = new Set<number>();
  private readonly mobs = new Set<number>();
  private readonly scroll: Record<MenuPanel, number> = { Settings: 0, Petals: 0, Mobs: 0, Changelog: 0 };
  private readonly scrollTarget: Record<MenuPanel, number> = { Settings: 0, Petals: 0, Mobs: 0, Changelog: 0 };
  private scale = 0.7;
  private width = 1280 / 0.7;
  private height = 720;
  private visible = false;
  private inputOffset = 0;
  private inputY: number | undefined;
  private pointerX = 0;
  private pointerY = 0;
  private hoveredTab: MenuPanel | undefined;
  private hoveredPetal: number | undefined;
  private hoveredMob: number | undefined;
  private readonly tooltipAlphas = new Map<number, number>();
  private readonly panelAlphas: Record<MenuPanel, number> = { Settings: 0, Petals: 0, Mobs: 0, Changelog: 0 };
  private hoveredMobDrop: { mob: number; index: number } | undefined;
  private readonly mobDropAlphas = new Map<string, number>();
  /** Survivor row, in native rebuild order: record types and +384 alphas. */
  private respawnItems: readonly number[] = [];
  private respawnAlphas: number[] = [];
  private hoveredRespawn: number | undefined;

  constructor() {
    this.root.id = 'menu-controls';
    this.root.hidden = true;
    this.root.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:Ubuntu,sans-serif';
    this.name.id = 'player-name';
    this.name.setAttribute('aria-label', 'Flower name');
    this.name.autocomplete = 'off'; this.name.spellcheck = false; this.name.maxLength = 48;
    this.name.style.cssText = 'position:absolute;box-sizing:border-box;pointer-events:auto;background:transparent;border:0;outline:0;padding:0;color:#000;font-family:Ubuntu,sans-serif;font-weight:bold';
    this.root.append(this.name);
    try {
      const saved = JSON.parse(storage('florr-menu') ?? '{}') as Record<string, unknown>;
      this.name.value = typeof saved.name === 'string' ? saved.name : storage('florrio_nickname') ?? '';
      this.keyboardMovement = saved.keyboardMovement === true
        || (saved.keyboardMovement === undefined && storage('florrio_keyboard_control') === '1');
      this.movementHelper = saved.movementHelper === true
        || (saved.movementHelper === undefined && storage('florrio_movement_helper') === '1');
      if (Array.isArray(saved.petals)) for (const id of saved.petals)
        if (Number.isInteger(id) && id > 0 && PETAL_INFO[id]) this.discoveries.add(id);
      if (Array.isArray(saved.mobs)) for (const id of saved.mobs)
        if (Number.isInteger(id) && id > 0 && MOB_INFO[id]) this.mobs.add(id);
    } catch { /* Storage may be unavailable; controls still work. */ }
    this.name.addEventListener('input', () => this.save());
    document.body.append(this.root);
    this.name.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
      if (event.key === 'Escape' && this.panel) { this.open(undefined); event.preventDefault(); }
      if (event.key !== 'Enter') event.stopPropagation();
    });
  }

  save(): void {
    const petals = [...this.discoveries];
    const mobs = [...this.mobs];
    store('florr-menu', JSON.stringify({ name: this.name.value, keyboardMovement: this.keyboardMovement,
      movementHelper: this.movementHelper, petals, mobs }));
    store('florrio_nickname', this.name.value);
    store('florrio_keyboard_control', this.keyboardMovement ? '1' : '0');
    store('florrio_movement_helper', this.movementHelper ? '1' : '0');
  }
  get petalDiscoveryCount(): number { return this.discoveries.size; }
  get discoveredPetals(): readonly number[] { return [...this.discoveries].sort((a, b) => a - b); }
  get discoveredMobs(): readonly number[] { return [...this.mobs].sort((a, b) => a - b); }
  discover(petals: readonly number[], mobs: readonly (readonly [number, string])[]): void {
    let changed = false;
    for (const type of petals) if (Number.isInteger(type) && type > 0 && PETAL_INFO[type] && !this.discoveries.has(type)) {
      this.discoveries.add(type); changed = true;
    }
    for (const [type] of mobs) if (Number.isInteger(type) && type > 0 && MOB_INFO[type] && !this.mobs.has(type)) {
      this.mobs.add(type); changed = true;
    }
    if (changed) this.save();
  }
  show(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) this.name.blur();
  }
  /** Native rebuilds the card records when the survivor list changes, which
   * also resets every +384 tooltip alpha; preserve that boundary. */
  setRespawn(items: readonly number[] | undefined): void {
    const next = (items ?? []).filter(type => PETAL_INFO[type]);
    if (next.length === this.respawnItems.length
        && next.every((type, index) => type === this.respawnItems[index])) return;
    this.respawnItems = next;
    this.respawnAlphas = new Array(next.length).fill(0);
    this.hoveredRespawn = undefined;
  }
  resize(width: number, height: number): void {
    this.scale = Math.fround(Math.max(0.7, Math.fround(Math.max(width * 0.000521, height * 0.000926))));
    this.width = Math.ceil(Math.fround(width / this.scale));
    this.height = Math.ceil(Math.fround(height / this.scale));
    this.positionInput();
  }
  private positionInput(): void {
    const s = this.scale, y = (this.inputY ?? Math.trunc(this.height / 4) + 200) + this.inputOffset;
    Object.assign(this.name.style, { left: `${(this.width / 2 - 195) * s}px`, top: `${(y + 5) * s}px`,
      width: `${390 * s}px`, height: `${40 * s}px`, fontSize: `${32 * s}px` });
  }
  presentInput(presentation: MenuInputPresentation, interactive: boolean): void {
    this.inputY = presentation.inputY;
    this.inputOffset = presentation.offsetY;
    this.positionInput();
    this.visible = interactive;
    const hidden = presentation.active === false || presentation.opacity <= 0.0001;
    const revealed = this.root.hidden && !hidden;
    this.root.hidden = hidden;
    this.root.style.display = this.root.hidden ? 'none' : 'block';
    this.root.style.opacity = String(presentation.opacity);
    this.name.style.pointerEvents = interactive ? 'auto' : 'none';
    if (!interactive) this.name.blur();
    else if (revealed) this.name.focus({ preventScroll: true });
  }
  open(panel: MenuPanel | undefined): void {
    this.panel = panel;
    this.scrollDrag = undefined;
    this.resetHover();
  }
  private scrollDrag?: { panel: MenuPanel; offset: number };
  private resetHover(): void {
    this.hoveredTab = undefined; this.hoveredPetal = undefined; this.hoveredMob = undefined; this.hoveredMobDrop = undefined;
    this.hoveredRespawn = undefined;
  }
  private logical(x: number, y: number): { x: number; y: number } {
    return { x: x / this.scale, y: y / this.scale };
  }
  pointerMove(x: number, y: number): void {
    const point = this.logical(x, y);
    this.pointerX = point.x; this.pointerY = point.y;
    this.hoveredTab = menuTabAt(point.x, point.y, this.height);
    this.hoveredPetal = undefined; this.hoveredMob = undefined; this.hoveredMobDrop = undefined;
    this.hoveredRespawn = undefined;
    for (let index = 0; index < this.respawnItems.length; index++) {
      const rect = menuRespawnCardRect(index, this.respawnItems.length, this.width, this.height);
      if (point.x >= rect.x && point.x <= rect.x + rect.width
          && point.y >= rect.y && point.y <= rect.y + rect.height) {
        this.hoveredRespawn = index;
        break;
      }
    }
    if (!this.panel) return;
    if (this.panel === 'Petals') {
      const index = petalCellAt(point.x, point.y, this.height, this.scroll.Petals, this.panelAlphas.Petals);
      if (index !== undefined) {
        const type = PETAL_GALLERY_TYPES[index];
        if (this.discoveries.has(type)) this.hoveredPetal = type;
      }
    } else if (this.panel === 'Mobs') {
      const offset = menuPanelRect('Mobs', this.height, this.panelAlphas.Mobs).y - menuPanelRect('Mobs', this.height).y;
      const index = mobRowAt(point.x, point.y - offset, this.height, this.scroll.Mobs, this.discoveredMobs);
      if (index !== undefined) {
        const type = MOB_GALLERY_TYPES[index];
        if (this.mobs.has(type)) {
          this.hoveredMob = type;
          for (let drop = 0; drop < MOB_GALLERY[type].drops.length; drop++) {
            const rect = mobDropRect(type, drop, this.height, this.discoveredMobs);
            if (point.x >= rect.x && point.x <= rect.x + rect.width && point.y - offset + this.scroll.Mobs >= rect.y
                && point.y - offset + this.scroll.Mobs <= rect.y + 49) { this.hoveredMobDrop = { mob: type, index: drop }; break; }
          }
        }
      }
    }
  }
  pointerDown(x: number, y: number): boolean {
    const point = this.logical(x, y);
    this.pointerMove(x, y);
    const tab = menuTabAt(point.x, point.y, this.height);
    if (tab) { this.open(this.panel === tab ? undefined : tab); return true; }
    if (!this.panel) return false;
    const alpha = this.panelAlphas[this.panel];
    const close = menuCloseRect(this.panel, this.height, alpha);
    if (point.x >= close.x && point.x <= close.x + close.width
        && point.y >= close.y && point.y <= close.y + close.height) {
      this.open(undefined); return true;
    }
    if (this.panel !== 'Settings') {
      const content = menuContentRect(this.panel, this.height, alpha);
      const max = menuScrollMax(this.panel, this.height, this.discoveredMobs);
      if (max > 0 && point.x >= content.x + content.width - 14
          && point.x <= content.x + content.width && point.y >= content.y
          && point.y <= content.y + content.height) {
        const track = f(content.height - 8);
        const thumb = f(track * f(content.height / (content.height + max)));
        const top = f(content.y + 4 + f((track - thumb) * (this.scroll[this.panel] / max)));
        const offset = point.y >= top - 4 && point.y <= top + thumb + 4
          ? point.y - top : thumb * 0.5;
        this.scrollDrag = { panel: this.panel, offset };
        this.dragScroll(point.y);
        return true;
      }
    }
    if (this.panel === 'Settings') {
      const row = settingsRowAt(point.x, point.y, this.height, alpha);
      if (row !== undefined) {
        if (row === 0) this.keyboardMovement = !this.keyboardMovement;
        else this.movementHelper = !this.movementHelper;
        this.save();
        return true;
      }
    }
    const panel = menuPanelRect(this.panel, this.height, alpha);
    return point.x >= panel.x && point.x <= panel.x + panel.width
      && point.y >= panel.y && point.y <= panel.y + panel.height;
  }
  /** Continue a scrollbar drag while the left button is held. */
  pointerDrag(x: number, y: number, down: boolean): void {
    if (!down) { this.scrollDrag = undefined; return; }
    if (!this.scrollDrag) return;
    this.pointerMove(x, y);
    this.dragScroll(this.pointerY);
  }
  private dragScroll(y: number): void {
    const drag = this.scrollDrag;
    if (!drag) return;
    const alpha = this.panelAlphas[drag.panel];
    const content = menuContentRect(drag.panel, this.height, alpha);
    const max = menuScrollMax(drag.panel, this.height, this.discoveredMobs);
    const track = f(content.height - 8);
    const thumb = f(track * f(content.height / (content.height + max)));
    const travel = f(track - thumb);
    if (!(max > 0) || !(travel > 0)) return;
    const thumbTop = f(y - drag.offset - content.y - 4);
    const value = Math.max(0, Math.min(max, f(f(thumbTop / travel) * max)));
    this.scroll[drag.panel] = value;
    this.scrollTarget[drag.panel] = value;
  }
  wheel(deltaY: number): boolean {
    if (!this.panel || this.panel === 'Settings') return false;
    const content = menuContentRect(this.panel, this.height, this.panelAlphas[this.panel]);
    if (this.pointerX < content.x || this.pointerX > content.x + content.width
        || this.pointerY < content.y || this.pointerY > content.y + content.height) return false;
    const max = menuScrollMax(this.panel, this.height, this.discoveredMobs);
    // Native func626 converts the normalized browser wheel into 75 content
    // units before storing its float32 scroll target (the panel scale is 1).
    this.scrollTarget[this.panel] = Math.max(0, Math.min(max,
      f(this.scrollTarget[this.panel] + f(deltaY * 75))));
    return true;
  }
  advance(delta: number, pressed = false): void {
    const step = Math.max(0, Math.min(1, 1 - Math.pow(0.7, Math.fround(delta) * 0.06)));
    // Only the visible panel scrolls; evaluating hidden Changelog layout here
    // would measure text before the menu surface exists and reorder native
    // offscreen allocations.
    if (this.panel !== undefined) {
      const panel = this.panel;
      const max = menuScrollMax(panel, this.height, this.discoveredMobs);
      const target = Math.max(0, Math.min(max, this.scrollTarget[panel]));
      this.scrollTarget[panel] = target;
      const current = this.scroll[panel];
      const scrollStep = Math.max(0, Math.min(1, 1 - Math.pow(0.8, Math.fround(delta) * 0.06)));
      this.scroll[panel] = Math.fround(current + (target - current) * scrollStep);
    }
    for (const panel of MENU_TABS) {
      const target = +(this.panel === panel), current = this.panelAlphas[panel];
      this.panelAlphas[panel] = Math.fround(Math.abs(current - target) < 1e-7 ? target : current + (target - current) * step);
    }
    this.pointerMove(this.pointerX * this.scale, this.pointerY * this.scale);
    for (const type of this.discoveries) {
      const target = +(this.panel === 'Petals' && this.hoveredPetal === type && !pressed);
      const current = this.tooltipAlphas.get(type) ?? 0;
      const alpha = Math.fround(Math.abs(current - target) < 1e-7 ? target : current + (target - current) * step);
      if (alpha > 0) this.tooltipAlphas.set(type, alpha);
      else this.tooltipAlphas.delete(type);
    }
    // Respawn cards use the same easing but their native target is only
    // `f[37] != 0` (the hover flag); unlike the galleries, a held mouse button
    // does not suppress it.
    for (let index = 0; index < this.respawnItems.length; index++) {
      const target = +(this.hoveredRespawn === index);
      const current = this.respawnAlphas[index] ?? 0;
      this.respawnAlphas[index] = Math.fround(Math.abs(current - target) < 1e-7
        ? target : current + (target - current) * step);
    }
    const hovered = this.hoveredMobDrop && `${this.hoveredMobDrop.mob}:${this.hoveredMobDrop.index}`;
    if (hovered && !this.mobDropAlphas.has(hovered)) this.mobDropAlphas.set(hovered, 0);
    for (const [key, current] of this.mobDropAlphas) {
      const target = +(this.panel === 'Mobs' && key === hovered && !pressed);
      const alpha = Math.fround(Math.abs(current - target) < 1e-7 ? target : current + (target - current) * step);
      if (alpha > 0) this.mobDropAlphas.set(key, alpha); else this.mobDropAlphas.delete(key);
    }
  }
  renderState(): MenuRenderState {
    return {
      panel: this.panel, panelAlphas: { ...this.panelAlphas }, pointerX: this.pointerX, pointerY: this.pointerY,
      hoveredTab: this.hoveredTab, hoveredPetal: this.hoveredPetal, hoveredMob: this.hoveredMob,
      petalTooltips: [...this.tooltipAlphas].map(([type, alpha]) => ({ type, alpha })),
      mobDropTooltips: [...this.mobDropAlphas].map(([key, alpha]) => { const [mob, index] = key.split(':').map(Number); return { mob, index, alpha }; }),
      respawnTooltips: this.respawnItems.flatMap((type, index) => {
        const alpha = this.respawnAlphas[index] ?? 0;
        return alpha > 0 ? [{ index, type, alpha }] : [];
      }),
      settings: { keyboardMovement: this.keyboardMovement, movementHelper: this.movementHelper },
      discoveries: [...this.discoveries], mobs: [...this.mobs],
      scroll: { ...this.scroll },
    };
  }
  get tabs(): readonly MenuPanel[] { return MENU_TABS; }
}
