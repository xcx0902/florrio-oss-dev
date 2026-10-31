/** Keyboard state with normalized single-character keys and physical codes. */
export class KeyboardInput {
  private readonly listeners = new AbortController();
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', event => {
      if (event.code !== 'Enter' && typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement
          && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
      if (!this.down.has(event.code)) this.pressed.add(event.code);
      this.down.add(event.code);
    }, { signal: this.listeners.signal });
    target.addEventListener('keyup', event => { this.down.delete(event.code); }, { signal: this.listeners.signal });
    target.addEventListener('blur', () => { this.down.clear(); this.pressed.clear(); }, { signal: this.listeners.signal });
  }

  isDown(code: string): boolean { return this.down.has(code); }
  /** True when the key was pressed since the last consumePressed call. */
  consumePressed(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }
  /** Test/browser helper: clear edge-triggered state without releasing keys. */
  clearPressed(): void { this.pressed.clear(); }
  dispose(): void { this.listeners.abort(); this.down.clear(); this.pressed.clear(); }
}
