/** Offscreen canvas cache for repeated sprite drawing. */
export class SpriteCache {
  private readonly sprites = new Map<string, HTMLCanvasElement>();

  get(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    let canvas = this.sprites.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context) draw(context);
      this.sprites.set(key, canvas);
    }
    return canvas;
  }

  clear(): void { this.sprites.clear(); }
}
