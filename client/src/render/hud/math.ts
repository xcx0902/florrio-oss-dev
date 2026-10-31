export const f = Math.fround;
export const TAU = Math.PI * 2;
export const clamp = (value: number, min = 0, max = 1): number => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
