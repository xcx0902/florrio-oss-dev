/** Text layout cache. Fonts are loaded before the first draw. */
export class TextRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly widths = new Map<string, number>();

  constructor(context: CanvasRenderingContext2D) { this.context = context; }

  setFont(font: string): void { this.context.font = font; }

  measure(text: string): number {
    const key = this.context.font + '\0' + text;
    let width = this.widths.get(key);
    if (width === undefined) {
      width = this.context.measureText(text).width;
      this.widths.set(key, width);
    }
    return width;
  }

  clear(): void { this.widths.clear(); }
}
