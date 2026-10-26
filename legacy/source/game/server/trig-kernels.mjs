/** Recovered sp_server f32 sine/cosine kernels (original functions 80 and 81).
 *
 * Both kernels evaluate a minimax polynomial in f64 and demote the result to
 * f32. 80 is cosine; 81 is sine. They are the server-side counterparts of the
 * client kernels and are used for small arguments (projectile and petal orbit
 * angles).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([80, 81]);
const COS_HALF = -0.499999997251031;
const COS_QUARTIC = 0.04166662332373906;
const COS_LINEAR = 2.439044879627741e-05;
const COS_CONSTANT = -0.001388676377460993;
const SIN_X7 = 2.718311493989822e-06;
const SIN_X7_CONSTANT = -0.00019839334836096632;
const SIN_X3 = 0.008333329385889463;
const SIN_X3_CONSTANT = -0.16666666641626524;

export function createTrigKernelHooks(_runtime) {
  /** Original 80: cos(x) as f32. */
  function cosine(value) {
    const squared = value * value;
    const quadratic = 1 + squared * COS_HALF;
    const fourth = squared * squared * COS_QUARTIC;
    const sixth = squared * squared * squared * (COS_LINEAR * squared + COS_CONSTANT);
    return Math.fround(quadratic + fourth + sixth);
  }
  /** Original 81: sin(x) as f32. */
  function sine(value) {
    const squared = value * value;
    const cubed = squared * value;
    const seventh = cubed * squared * squared;
    const cubicTerm = cubed * (SIN_X3 * squared + SIN_X3_CONSTANT);
    const seventhTerm = seventh * (SIN_X7 * squared + SIN_X7_CONSTANT);
    return Math.fround(value + cubicTerm + seventhTerm);
  }
  return Object.freeze({80: cosine, 81: sine});
}
