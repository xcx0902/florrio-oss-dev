/** UI layouts use CSS pixels unless explicitly marked logical. DPR belongs to drawing. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export function contains(rect: Rect, x: number, y: number, margin = 0): boolean {
  return x >= rect.x - margin && x < rect.x + rect.width + margin
    && y >= rect.y - margin && y < rect.y + rect.height + margin;
}
