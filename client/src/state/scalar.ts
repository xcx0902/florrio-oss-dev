/** One independently timed scalar; zero is a known value, undefined is omission. */
export interface ScalarState {
  readonly value: number;
  readonly from: number;
  readonly receivedAt: number;
  readonly known: boolean;
}
export function mergeScalar(previous: ScalarState | undefined, incoming: number | undefined,
  displayed: number, at: number): ScalarState {
  if (incoming === undefined) return previous ?? { value: 0, from: 0, receivedAt: at, known: false };
  return { value: incoming, from: displayed, receivedAt: at, known: true };
}
