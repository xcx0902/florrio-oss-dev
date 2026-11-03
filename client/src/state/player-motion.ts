import { MOTION as M } from '../schema/motion.js';
export interface MotionState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export interface MotionIntent {
  angle: number;
  strength: number;
  buttons?: number;
}
export interface MotionParameters {
  motionScale: number;
  accelerationX: number;
  accelerationY: number;
  arenaWidth: number;
  arenaHeight: number;
  radius: number;
}
/** Same f32 boundaries and expression grouping as engine/sim/player_motion.cpp. */
export function stepMotion(
  state: MotionState,
  input: MotionIntent,
  p: MotionParameters,
  dt = 50,
): MotionState {
  const f = Math.fround;
  const behavior = f(p.motionScale * f(M.controlScale));
  const base = f(dt * behavior * 0.001);
  const strength = f(input.strength),
    radians = f(f(input.angle) % M.angleModulus);
  const impulse = f(strength < M.maxStrength ? base * f(strength * M.strengthScale) : base);
  const vx = state.vx + f(f(Math.cos(radians)) * impulse),
    vy = state.vy + f(f(Math.sin(radians)) * impulse);
  const damping = M.damping ** dt,
    drag = M.dragScale - damping * M.dragScale;
  const next = {
    x: f(drag * vx + dt * p.accelerationX + state.x),
    y: f(drag * vy + dt * p.accelerationY + state.y),
    vx: damping * vx,
    vy: damping * vy,
  };
  const x = p.arenaWidth * 0.5 - p.radius,
    y = p.arenaHeight * 0.5 - p.radius;
  if (next.x > x) {
    next.x = f(x);
    next.vx = 0;
  }
  if (next.x < -x) {
    next.x = f(-x);
    next.vx = 0;
  }
  if (next.y > y) {
    next.y = f(y);
    next.vy = 0;
  }
  if (next.y < -y) {
    next.y = f(-y);
    next.vy = 0;
  }
  if (Math.abs(next.vx) < M.velocityEpsilon) {
    next.vx = 0;
  }
  if (Math.abs(next.vy) < M.velocityEpsilon) {
    next.vy = 0;
  }
  return next;
}
