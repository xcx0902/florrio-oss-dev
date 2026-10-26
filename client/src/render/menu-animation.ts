/** Time-driven menu flowers recovered from clientFrame (original 1095).
 * New flowers enter at x=-50 every 200 ms. Scale is uniform [0.5,2], forward
 * speed is 100*scale units/s, and y bobs by 20*sin(seconds+phase). The fixed
 * 16 ms animation step preserves f32 integration independently of display Hz.
 */
export interface MenuFlower { readonly x: number; readonly y: number; readonly scale: number; readonly type: number; }
interface Particle { x: number; y: number; scale: number; phase: number; type: number; }
const f = Math.fround;
const UI = f(0.7);

export function menuSeed(): number {
  if (typeof window === 'undefined') return 1;
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return new DataView(bytes.buffer).getUint32(0, true);
}

export class MenuAnimation {
  private state = 1;
  private at = 0;
  private spawnCountdown = 0;
  private particles: Particle[] = [];
  private dimensions = '';
  private types: readonly number[] = [1];
  private typesKey = '1';

  constructor(readonly seed: number) { this.reset(); }

  private reset(): void {
    this.state = (this.seed >>> 0) % 2147483647 || 1;
    this.at = 0;
    this.spawnCountdown = 0;
    this.particles = [];
  }

  private next(): number {
    this.state = this.state * 48271 % 2147483647;
    return this.state;
  }

  /** Use only petal types the player has discovered. Empty falls back to Basic. */
  setPetals(types: readonly number[]): void {
    const valid = types.filter(type => Number.isInteger(type) && type > 0);
    const key = (valid.length ? valid : [1]).slice().sort((a, b) => a - b).join(',');
    if (key === this.typesKey) return;
    this.typesKey = key;
    this.types = key.split(',').map(Number);
  }

  sample(now: number, width: number, height: number): readonly MenuFlower[] {
    const dimensions = `${width}|${height}`;
    if (now < this.at || dimensions !== this.dimensions) this.reset();
    this.dimensions = dimensions;
    const target = Math.floor(Math.max(0, now) / 16) * 16;
    const uiHeight = Math.ceil(height / UI);
    while (this.at < target) {
      this.at += 16;
      this.spawnCountdown = f(this.spawnCountdown - 16);
      if (this.spawnCountdown < 0) {
        this.spawnCountdown = f(this.spawnCountdown + 200);
        if (this.particles.length < 100) {
          const type = this.types[this.next() % this.types.length] ?? 1;
          const y = f(f(f((uiHeight + 40) * f(this.next() - 1)) * 2 ** -31) - 20);
          const scale = f(f(f(this.next() - 1) * (1.5 * 2 ** -31)) + 0.5);
          const phase = f(f(this.next() - 1) * f(Math.PI / 2 ** 30));
          this.particles.push({ x: -50, y, scale, phase, type });
        }
      }
      for (const particle of this.particles) {
        particle.x = f(f(f(particle.scale * 100) * 16) * 0.001 + particle.x);
      }
      this.particles = this.particles.filter(particle => particle.x < width / UI + 50);
    }
    return this.particles.slice().sort((a, b) => a.scale - b.scale).map(particle => ({
      x: f(particle.x * UI),
      y: f(f(particle.y + f(Math.sin(now * 0.001 + particle.phase) * 20)) * UI),
      scale: f(particle.scale * UI),
      type: particle.type,
    }));
  }
}

/** Original text caret opacity; absolute clock is in milliseconds. */
export function caretAlpha(now: number): number {
  return Math.sqrt(0.5 - Math.cos(Math.max(0, now) * 0.013) * 0.5);
}
