/** Recovered sp_server sine/cosine correction kernels (functions 153 and 154).
 *
 * Function 153 evaluates cosine with a linear product correction (used by
 * argument reduction for sums of angles) in a fixed f64 operation order.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([153]);
const COS_C1 = 2.480158728947673e-05;
const COS_C2 = -0.001388888888887411;
const COS_C3 = 0.0416666666666666;
const COS_C4 = -1.1359647557788195e-11;
const COS_C5 = 2.087572321298175e-09;
const COS_C6 = -2.7557314351390663e-07;
export function createTrigCorrectionHook(_runtime) {
  /** Original 153: cosine polynomial with a linear product correction. */
  function cosineMinusProduct(x, y) {
    const x2 = x * x;
    const half = x2 * 0.5;
    const base = 1 - half;
    const delta = (1 - base) - half;
    const poly = x2 * (x2 * (x2 * COS_C1 + COS_C2) + COS_C3);
    const x8 = (x2 * x2) * (x2 * x2);
    const inner = x2 * (x2 * COS_C4 + COS_C5) + COS_C6;
    return base + (delta + (x2 * (poly + x8 * inner) - x * y));
  }

  return Object.freeze({153: cosineMinusProduct});
}
