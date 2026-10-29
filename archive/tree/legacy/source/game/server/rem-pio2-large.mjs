/** Recovered sp_server Payne–Hanek reduction (original 285).
 *
 * `__rem_pio2_large(x, y, e0, nx, prec)` reduces the nx 24-bit limbs in x by
 * pi/2, writing y[0], y[1] and returning the low three bits of the quadrant.
 * The limb products are accumulated in f64, distilled into 24-bit integers
 * `iq`, corrected for cancellation, and finally convolved with the PIo2 table.
 *
 * Tables are the ones embedded in this binary: init_jk = {3,4,4,6} and the
 * 66-entry 2/pi bit table at linear address 19200. The control flow follows
 * FreeBSD k_rem_pio2.c, including the ih>0 complement/carry step and the
 * medium recomputation loop. `scalbn` is recovered function 107.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([285]);

const INIT_JK = Object.freeze([3, 4, 4, 6]);
const IPIO2 = Object.freeze([
  0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62,
  0x95993c, 0x439041, 0xfe5163, 0xabdebb, 0xc561b7, 0x246e3a,
  0x424dd2, 0xe00649, 0x2eea09, 0xd1921c, 0xfe1deb, 0x1cb129,
  0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c, 0x7026b4, 0x5f7e41,
  0x3991d6, 0x398353, 0x39f49c, 0x845f8b, 0xbdf928, 0x3b1ff8,
  0x97ffde, 0x05980f, 0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf,
  0x27cb09, 0xb74f46, 0x3f669e, 0x5fea2d, 0x7527ba, 0xc7ebe5,
  0xf17b3d, 0x0739f7, 0x8a5292, 0xea6bfb, 0x5fb11f, 0x8d5d08,
  0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20, 0x9af436, 0x1da9e3,
  0x91615e, 0xe61b08, 0x659985, 0x5f14a0, 0x68408d, 0xffd880,
  0x4d7327, 0x310606, 0x1556ca, 0x73a8c9, 0x60e27b, 0xc08c6b,
]);
const PIO2 = Object.freeze([
  1.57079625129699707031, 7.54978941586159635335e-08,
  5.39030252995776476554e-15, 3.28200341580791294123e-22,
  1.27065575308067607349e-29, 1.22933308981111328932e-36,
  2.73370053816464559624e-44, 2.16741683877804819444e-51,
]);
const TWON24 = 5.9604644775390625e-08;
const TWO24 = 16777216;

export function createRemPio2LargeHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 285: argument reduction from an array of 24-bit limbs. */
  function remPio2Large(xPointer, yPointer, e0, nx, precision) {
    const memory = memoryView();
    const x = new Float64Array(nx);
    for (let index = 0; index < nx; index++) {
      x[index] = memory.getFloat64((xPointer >>> 0) + index * 8, true);
    }
    const writeDouble = (index, value) => {
      memory.setFloat64((yPointer >>> 0) + index * 8, value, true);
    };
    const scalbn = (value, exponent) => runtime.call(107, value, exponent);

    const jk = INIT_JK[precision];
    const jp = jk;
    const jx = nx - 1;
    let jv = Math.trunc((e0 - 3) / 24);
    if (jv < 0) jv = 0;
    let q0 = e0 - 24 * (jv + 1);

    const f = new Float64Array(20);
    const fq = new Float64Array(20);
    const q = new Float64Array(20);
    const iq = new Int32Array(20);

    let j = jv - jx;
    const m = jx + jk;
    for (let index = 0; index <= m; index++, j++) {
      f[index] = j < 0 ? 0 : IPIO2[j];
    }
    for (let index = 0; index <= jk; index++) {
      let fw = 0;
      for (let inner = 0; inner <= jx; inner++) fw += x[inner] * f[jx + index - inner];
      q[index] = fw;
    }
    let jz = jk;

    let z;
    let n;
    let ih;
    let fw;
    let carry;
    for (;;) {
      let index = 0;
      z = q[jz];
      for (let inner = jz; inner >= 1; inner--) {
        fw = trunc32(TWON24 * z);
        iq[index++] = (z - TWO24 * fw) | 0;
        z = q[inner - 1] + fw;
      }

      z = scalbn(z, q0);
      z -= 8 * Math.floor(z * 0.125);
      n = trunc32(z);
      z -= n;
      ih = 0;
      if (q0 > 0) {
        const shift = 24 - q0;
        const top = iq[jz - 1] >> shift;
        n += top;
        iq[jz - 1] = (iq[jz - 1] - (top << shift)) | 0;
        ih = iq[jz - 1] >> (23 - q0);
      } else if (q0 === 0) {
        ih = iq[jz - 1] >> 23;
      } else if (z >= 0.5) {
        ih = 2;
      }

      if (ih > 0) {
        n += 1;
        carry = 0;
        for (index = 0; index < jz; index++) {
          const word = iq[index];
          if (carry === 0) {
            if (word !== 0) {
              carry = 1;
              iq[index] = (0x1000000 - word) | 0;
            }
          } else {
            iq[index] = (0xffffff - word) | 0;
          }
        }
        if (q0 > 0) {
          if (q0 === 1) iq[jz - 1] &= 0x7fffff;
          else if (q0 === 2) iq[jz - 1] &= 0x3fffff;
        }
        if (ih === 2) {
          z = 1 - z;
          if (carry !== 0) z -= scalbn(1, q0);
        }
      }

      if (z === 0) {
        let any = 0;
        for (index = jz - 1; index >= jk; index--) any |= iq[index];
        if (any === 0) {
          let k = 1;
          while (iq[jk - k] === 0) k++;
          for (index = jz + 1; index <= jz + k; index++) {
            f[jx + index] = IPIO2[jv + index];
            fw = 0;
            for (let inner = 0; inner <= jx; inner++) fw += x[inner] * f[jx + index - inner];
            q[index] = fw;
          }
          jz += k;
          continue;
        }
      }
      break;
    }

    if (z === 0) {
      jz -= 1;
      q0 -= 24;
      while (iq[jz] === 0) {
        jz -= 1;
        q0 -= 24;
      }
    } else {
      z = scalbn(z, -q0);
      if (z >= TWO24) {
        fw = trunc32(TWON24 * z);
        iq[jz] = (z - TWO24 * fw) | 0;
        jz += 1;
        q0 += 24;
        iq[jz] = fw | 0;
      } else {
        iq[jz] = trunc32(z);
      }
    }

    fw = scalbn(1, q0);
    for (let index = jz; index >= 0; index--) {
      q[index] = fw * iq[index];
      fw *= TWON24;
    }
    for (let index = jz; index >= 0; index--) {
      fw = 0;
      for (let k = 0; k <= jp && k <= jz - index; k++) fw += PIO2[k] * q[index + k];
      fq[jz - index] = fw;
    }

    if (precision === 0) {
      fw = 0;
      for (let index = jz; index >= 0; index--) fw += fq[index];
      writeDouble(0, ih === 0 ? fw : -fw);
    } else if (precision === 1 || precision === 2) {
      fw = 0;
      for (let index = jz; index >= 0; index--) fw += fq[index];
      writeDouble(0, ih === 0 ? fw : -fw);
      fw = fq[0] - fw;
      for (let index = 1; index <= jz; index++) fw += fq[index];
      writeDouble(1, ih === 0 ? fw : -fw);
    } else {
      for (let index = jz; index >= 1; index--) {
        fw = fq[index - 1] + fq[index];
        fq[index] += fq[index - 1] - fw;
        fq[index - 1] = fw;
      }
      for (let index = jz; index >= 2; index--) {
        fw = fq[index - 1] + fq[index];
        fq[index] += fq[index - 1] - fw;
        fq[index - 1] = fw;
      }
      fw = 0;
      for (let index = jz; index >= 2; index--) fw += fq[index];
      if (ih === 0) {
        writeDouble(0, fq[0]);
        writeDouble(1, fq[1]);
        writeDouble(2, fw);
      } else {
        writeDouble(0, -fq[0]);
        writeDouble(1, -fq[1]);
        writeDouble(2, -fw);
      }
    }
    return n & 7;
  }

  return Object.freeze({285: remPio2Large});
}

function trunc32(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 0x80000000) return -0x80000000;
  return Math.trunc(value) | 0;
}
