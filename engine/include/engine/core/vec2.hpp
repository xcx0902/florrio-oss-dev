#pragma once
#include "engine/core/f32.hpp"
#include <cmath>

namespace engine {

struct Vec2 {
  f32 x;
  f32 y;

  constexpr Vec2() = default;
  constexpr Vec2(f32 x_value, f32 y_value) : x(x_value), y(y_value) {}

  [[nodiscard]] constexpr Vec2 operator+(Vec2 other) const { return Vec2(x + other.x, y + other.y); }
  [[nodiscard]] constexpr Vec2 operator-(Vec2 other) const { return Vec2(x - other.x, y - other.y); }
  [[nodiscard]] constexpr Vec2 operator*(f32 scale) const { return Vec2(x * scale, y * scale); }
  [[nodiscard]] constexpr Vec2 operator/(f32 scale) const { return Vec2(x / scale, y / scale); }
  constexpr Vec2& operator+=(Vec2 other) { x += other.x; y += other.y; return *this; }
  constexpr Vec2& operator-=(Vec2 other) { x -= other.x; y -= other.y; return *this; }
  constexpr Vec2& operator*=(f32 scale) { x *= scale; y *= scale; return *this; }

  [[nodiscard]] constexpr f32 dot(Vec2 other) const { return x * other.x + y * other.y; }
  [[nodiscard]] f32 length_squared() const { return dot(*this); }
  [[nodiscard]] f32 length() const { return f32::from_double(std::sqrt(static_cast<double>(length_squared().value))); }
  [[nodiscard]] Vec2 normalized() const {
    const f32 len = length();
    return len.value == 0.0F ? Vec2() : Vec2(x / len, y / len);
  }
};

/** Double-precision vector for fields the original keeps as f64 (transform
 * velocity +40/+48 and acceleration +56/+64). Positions and radii stay f32. */
struct Vec2d {
  double x = 0.0;
  double y = 0.0;

  constexpr Vec2d() = default;
  constexpr Vec2d(double x_value, double y_value) : x(x_value), y(y_value) {}
  explicit constexpr Vec2d(Vec2 value) : x(value.x.value), y(value.y.value) {}

  [[nodiscard]] constexpr Vec2d operator+(Vec2d other) const { return Vec2d(x + other.x, y + other.y); }
  [[nodiscard]] constexpr Vec2d operator-(Vec2d other) const { return Vec2d(x - other.x, y - other.y); }
  [[nodiscard]] constexpr Vec2d operator*(double scale) const { return Vec2d(x * scale, y * scale); }
  constexpr Vec2d& operator+=(Vec2d other) { x += other.x; y += other.y; return *this; }
  constexpr Vec2d& operator-=(Vec2d other) { x -= other.x; y -= other.y; return *this; }
  [[nodiscard]] Vec2 to_f32() const {
    return Vec2(f32::from_double(x), f32::from_double(y));
  }
};

} // namespace engine
