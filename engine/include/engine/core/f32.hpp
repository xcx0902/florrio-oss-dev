#pragma once
#include <bit>
#include <cstdint>

namespace engine {

/** Explicit binary32 value. Arithmetic stays in float; converting a double
 * requires an explicit call so a silent double contraction cannot creep in. */
struct f32 {
  float value;

  constexpr f32() : value(0.0F) {}
  explicit constexpr f32(float input) : value(input) {}

  static constexpr f32 from_bits(std::uint32_t bits) { return f32(std::bit_cast<float>(bits)); }
  [[nodiscard]] constexpr std::uint32_t bits() const { return std::bit_cast<std::uint32_t>(value); }
  [[nodiscard]] constexpr float to_float() const { return value; }

  static constexpr f32 from_double(double input) { return f32(static_cast<float>(input)); }

  constexpr f32& operator+=(f32 other) { value += other.value; return *this; }
  constexpr f32& operator-=(f32 other) { value -= other.value; return *this; }
  constexpr f32& operator*=(f32 other) { value *= other.value; return *this; }
  constexpr f32& operator/=(f32 other) { value /= other.value; return *this; }
};

[[nodiscard]] constexpr f32 operator+(f32 a, f32 b) { return f32(a.value + b.value); }
[[nodiscard]] constexpr f32 operator-(f32 a, f32 b) { return f32(a.value - b.value); }
[[nodiscard]] constexpr f32 operator*(f32 a, f32 b) { return f32(a.value * b.value); }
[[nodiscard]] constexpr f32 operator/(f32 a, f32 b) { return f32(a.value / b.value); }
[[nodiscard]] constexpr bool operator==(f32 a, f32 b) { return a.value == b.value; }
[[nodiscard]] constexpr bool operator!=(f32 a, f32 b) { return a.value != b.value; }
[[nodiscard]] constexpr bool operator<(f32 a, f32 b) { return a.value < b.value; }
[[nodiscard]] constexpr bool operator<=(f32 a, f32 b) { return a.value <= b.value; }
[[nodiscard]] constexpr bool operator>(f32 a, f32 b) { return a.value > b.value; }
[[nodiscard]] constexpr bool operator>=(f32 a, f32 b) { return a.value >= b.value; }

} // namespace engine
