/** Path2D cache keyed by a stable string. */
export class PathCache {
  private readonly paths = new Map<string, Path2D>();

  get(key: string, build: (path: Path2D) => void): Path2D {
    let path = this.paths.get(key);
    if (!path) {
      path = new Path2D();
      build(path);
      this.paths.set(key, path);
    }
    return path;
  }

  clear(): void { this.paths.clear(); }
}
