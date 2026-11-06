/** Mouse camera pan fed by queued input. The pan is smoothed per render frame
 * and expressed as world offsets. */
export interface PanState {
  readonly x: number;
  readonly y: number;
}

export interface PointerMovementInput {
  /** Cached input transform, including the previous pan and the arena clamp
   * applied by the world-transform update. */
  readonly displayedX: number;
  readonly displayedY: number;
  /** Mouse coordinates in viewport pixels, truncated to i32 on use. */
  readonly mouseX: number;
  readonly mouseY: number;
  /** Current camera projection, before this frame's follow/zoom update. */
  readonly cameraX: number;
  readonly cameraY: number;
  /** Pixels per world unit, including the camera's viewport factor. */
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}
export interface PointerMovement {
  /** atan2f direction in radians. */
  readonly angle: number;
  /** Raw world distance narrowed to f32. This is neither the capped pan factor
   * nor a normalized movement input. */
  readonly strength: number;
}
export interface PanInput extends PointerMovementInput {
  readonly deltaMs: number;
  /** Settings control bit 1. Disabled pan eases toward zero; default true. */
  readonly enabled?: boolean;
}

export function createPanState(): PanState {
  return { x: 0, y: 0 };
}

const f = Math.fround;
const bitsView = new DataView(new ArrayBuffer(4));
function floatBits(value: number): number {
  bitsView.setFloat32(0, value, true);
  return bitsView.getUint32(0, true);
}
const atanHigh = [0.46364760398864746, 0.7853981256484985, 0.9827936887741089, 1.570796251296997];
const atanLow = [
  5.01215824399992e-9, 3.774894707930798e-8, 3.447321716976148e-8, 7.549789415861596e-8,
];

/** f32 atan2 approximation: the ratio is divided in f32 before the polynomial,
 * so rounding Math.atan2 differs by ULPs. */
function atanFloat(value: number): number {
  const absolute = floatBits(value) & 0x7fffffff;
  if (absolute > 0x4c7fffff) {
    return value < 0 ? -atanHigh[3] : atanHigh[3];
  }
  let x = value,
    index = -1;
  if (absolute <= 0x3edfffff) {
    if (absolute < 0x39800000) {
      return value;
    }
  } else {
    x = Math.abs(value);
    if (absolute <= 0x3f2fffff) {
      x = f(f(f(2 * x) - 1) / f(x + 2));
      index = 0;
    } else if (absolute <= 0x3f97ffff) {
      x = f(f(x - 1) / f(x + 1));
      index = 1;
    } else if (absolute <= 0x401bffff) {
      x = f(f(x - 1.5) / f(f(1.5 * x) + 1));
      index = 2;
    } else {
      x = f(-1 / x);
      index = 3;
    }
  }
  const square = f(x * x),
    fourth = f(square * square);
  const high = f(fourth * f(f(fourth * -0.106480173766613) - 0.19999158382415771));
  const low = f(
    square *
      f(f(fourth * f(f(fourth * 0.06168760731816292) + 0.14253635704517365)) + 0.333333283662796),
  );
  const sum = f(high + low);
  if (index < 0) {
    return f(x - f(x * sum));
  }
  const result = f(atanHigh[index] - f(f(f(x * sum) - atanLow[index]) - x));
  return value < 0 ? -result : result;
}

/** f32 ratio, signed quadrants and split-pi correction. */
function atan2Float(y: number, x: number): number {
  const rawX = floatBits(x),
    rawY = floatBits(y);
  const absX = rawX & 0x7fffffff,
    absY = rawY & 0x7fffffff;
  if (absX >= 0x7f800000 || absY >= 0x7f800000 || absY === 0 || absX === 0) {
    return f(Math.atan2(y, x));
  }
  if (x === 1) {
    return atanFloat(y);
  }
  const quadrant = ((rawX >>> 30) & 2) | (rawY >>> 31);
  if ((absX + 0x0d000000) >>> 0 < absY) {
    return y < 0 ? -f(Math.PI / 2) : f(Math.PI / 2);
  }
  const angle =
    quadrant & 2 && (absY + 0x0d000000) >>> 0 < absX ? 0 : atanFloat(Math.abs(f(y / x)));
  if (quadrant === 0) {
    return angle;
  }
  if (quadrant === 1) {
    return -angle;
  }
  const corrected = f(angle + 8.742277657347586e-8);
  return quadrant === 2 ? f(f(Math.PI) - corrected) : f(corrected - f(Math.PI));
}

/** Raw mouse movement before queued input applies its UI suppression.
 * Inputs use a finite camera projection with positive zoom. Pan enablement
 * does not affect movement; keyboard/touch inputs use their separate rules. */
export function getPointerMovement(input: PointerMovementInput): PointerMovement {
  const zoom = f(input.zoom);
  const pointerX = f(
    f(input.cameraX) + f(f(f(input.mouseX | 0) - (input.viewportWidth | 0) * 0.5) / zoom),
  );
  const pointerY = f(
    f(input.cameraY) + f(f(f(input.mouseY | 0) - (input.viewportHeight | 0) * 0.5) / zoom),
  );
  const x = f(input.displayedX),
    y = f(input.displayedY);
  const dx = pointerX - x,
    dy = pointerY - y;
  return { strength: f(Math.sqrt(dx * dx + dy * dy)), angle: atan2Float(f(dy), f(dx)) };
}

/** Pan derives from mouse movement with separate f32 narrowings.
 * A direct normalized dx/dy changes these results. */
export function getPanTarget(input: PanInput): PanState {
  if (input.enabled === false) {
    return createPanState();
  }
  const movement = getPointerMovement(input);
  const strength = Math.min(f(movement.strength * 0.009999999776482582), 1);
  return {
    x: f(f(strength * f(Math.cos(movement.angle))) * 5),
    y: f(f(strength * f(Math.sin(movement.angle))) * 5),
  };
}

/** Pure update: retain this result per local player and pass x/y as world
 * offsets to camera follow. Delta remains f64 here. */
export function updatePanState(previous: PanState, input: PanInput): PanState {
  const target = getPanTarget(input);
  const blend = Math.max(0, Math.min(1, 1 - Math.pow(0.95, input.deltaMs * 0.06)));
  const smooth = (current: number, to: number): number => {
    current = Math.fround(current);
    return Math.fround(Math.abs(current - to) < 1e-7 ? to : (to - current) * blend + current);
  };
  return { x: smooth(previous.x, target.x), y: smooth(previous.y, target.y) };
}
