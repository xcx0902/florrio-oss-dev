#pragma once
#include <bit>
#include <cstdint>

namespace engine::projectile_math {
// Shipped WASM77/78, kernels80/81 and the small-argument branch of284.
// Peas angles are bounded by [0,4*pi]; native libm differs by an ULP here.
inline float cosine_kernel(double x) {
  const double z = x * x, w = z * z;
  return static_cast<float>((z * -0x1.ffffffd0c5e81p-2 + 1.0)
    + w * 0x1.55553e1053a42p-5
    + (z * w) * (z * 0x1.99342e0ee5069p-16 - 0x1.6c087e80f1e27p-10));
}
inline float sine_polynomial(double x) {
  const double z = x * x, v = z * x;
  return static_cast<float>((v * (z * 0x1.11110896efbb2p-7 - 0x1.5555554cbac77p-3) + x)
    + (v * (z * z)) * (z * 0x1.6cd878c3b46a7p-19 - 0x1.a00f9e2cae774p-13));
}
inline float peas_cos(float angle) {
  const auto bits = std::bit_cast<std::uint32_t>(angle) & 0x7FFFFFFFU;
  const double x = angle;
  if (bits <= 1061752794U) return bits < 964689920U ? 1.0F : cosine_kernel(x);
  if (bits <= 1081824209U) {
    if (bits >= 1075235812U) return -cosine_kernel(x - 0x1.921fb54442d18p+1);
    return sine_polynomial(0x1.921fb54442d18p+0 - x);
  }
  if (bits <= 1088565717U) {
    if (bits >= 1085271520U) return cosine_kernel(x - 0x1.921fb54442d18p+2);
    return sine_polynomial(x - 0x1.2d97c7f3321d2p+2);
  }
  const double count = (x * 0x1.45f306dc9c883p-1 + 0x1.8p+52) - 0x1.8p+52;
  const double reduced = (x + count * -0x1.921fb5p+0) + count * -0x1.110b4611a6263p-26;
  switch (static_cast<int>(count) & 3) {
    case 0: return cosine_kernel(reduced);
    case 1: return sine_polynomial(-reduced);
    case 2: return -cosine_kernel(reduced);
    default: return sine_polynomial(reduced);
  }
}
inline float peas_sin(float angle) {
  const auto bits = std::bit_cast<std::uint32_t>(angle) & 0x7FFFFFFFU;
  const double x = angle;
  if (bits <= 1061752794U) return bits < 964689920U ? angle : sine_polynomial(x);
  if (bits <= 1081824209U) {
    if (bits <= 1075235811U) return cosine_kernel(x - 0x1.921fb54442d18p+0);
    return sine_polynomial(-(x - 0x1.921fb54442d18p+1));
  }
  if (bits <= 1088565717U) {
    if (bits <= 1085271519U) return -cosine_kernel(x - 0x1.2d97c7f3321d2p+2);
    return sine_polynomial(x - 0x1.921fb54442d18p+2);
  }
  const double count = (x * 0x1.45f306dc9c883p-1 + 0x1.8p+52) - 0x1.8p+52;
  const double reduced = (x + count * -0x1.921fb5p+0) + count * -0x1.110b4611a6263p-26;
  switch (static_cast<int>(count) & 3) {
    case 0: return sine_polynomial(reduced);
    case 1: return cosine_kernel(reduced);
    case 2: return sine_polynomial(-reduced);
    default: return -cosine_kernel(reduced);
  }
}
} // namespace engine::projectile_math
