/** Native4355 Unique Basic trail. State belongs to the visual's lifetime,
 * including world positions, a 50 ms emission budget and swap-removal. */
import type { Canvas2DContext } from './canvas2d/context.js';

export interface PetalParticle { x: number; y: number; vx: number; vy: number; opacity: number }
export interface UniqueTrail { budget: number; particles: PetalParticle[] }
export const createUniqueTrail = (): UniqueTrail => ({ budget: 0, particles: [] });

/** The native client shares this Park–Miller stream among artwork instances.
 * Return the original f32 angle, including the two rounded multiplications. */
export function createArtRandom(seed = 1): () => number {
  let state = seed;
  return () => {
    state = state * 48271 % 2147483647;
    return Math.fround(Math.fround(state - 1) * Math.fround(2 * Math.PI / 2147483648));
  };
}

export function drawUniqueTrail(context: Canvas2DContext, state: UniqueTrail, deltaMs: number,
  x: number, y: number, randomAngle: () => number): void {
  const f = Math.fround, delta = f(Math.max(0,deltaMs));
  state.budget = f(state.budget-delta);
  if (state.budget <= 0) {
    while (state.particles.length < 32) {
      state.budget = f(state.budget+50);
      const angle = randomAngle();
      state.particles.push({ x:f(x), y:f(y), vx:f(f(Math.cos(angle))*70),
        vy:f(f(Math.sin(angle))*70), opacity:1 });
      if (state.budget > 0) break;
    }
    if (state.budget < 0) state.budget = 0;
  }
  const step = f(1-Math.pow(0.9,delta*0.06)), movement = f(delta*f(0.001));
  const alpha = context.getGlobalAlpha?.() ?? 1;
  context.setFillRgb(255,255,255);
  for (const particle of state.particles) {
    particle.opacity = Math.abs(particle.opacity) < 1e-7 ? 0
      : f(particle.opacity-particle.opacity*step);
    particle.x = f(particle.x+f(particle.vx*movement));
    particle.y = f(particle.y+f(particle.vy*movement));
    context.setGlobalAlpha(alpha*particle.opacity);
    context.beginPath(); context.arc(f(particle.x-f(x)),f(particle.y-f(y)),3,0,Math.PI*2); context.fill();
    context.setGlobalAlpha(alpha);
  }
  for (let index = 0; index < state.particles.length; index++) {
    if (state.particles[index].opacity > 0.001) continue;
    const last = state.particles.pop()!;
    if (index === state.particles.length) break;
    state.particles[index] = last;
    // Native swap-removal advances the cursor after moving the last record.
  }
}
