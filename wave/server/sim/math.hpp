#pragma once

#include <algorithm>
#include <cmath>
#include <limits>

namespace wave::sim {

// Vec2d arithmetic adapted from engine/core/vec2.hpp. Simulation uses binary64.
struct Vec2 {
  double x = 0;
  double y = 0;

  constexpr bool operator==(const Vec2&) const = default;
  [[nodiscard]] constexpr Vec2 operator+(Vec2 other) const { return {x + other.x, y + other.y}; }
  [[nodiscard]] constexpr Vec2 operator-(Vec2 other) const { return {x - other.x, y - other.y}; }
  [[nodiscard]] constexpr Vec2 operator*(double scale) const { return {x * scale, y * scale}; }
  constexpr Vec2& operator+=(Vec2 other) {
    x += other.x;
    y += other.y;
    return *this;
  }
  [[nodiscard]] double length() const { return std::hypot(x, y); }
  [[nodiscard]] bool finite() const { return std::isfinite(x) && std::isfinite(y); }
};

[[nodiscard]] inline Vec2 clamp_center(Vec2 point, double arena_radius, double body_radius) {
  const double limit = std::max(0.0, arena_radius - body_radius);
  if (point.length() <= limit) {
    return point;
  }
  const double largest = std::max(std::abs(point.x), std::abs(point.y));
  const Vec2 scaled{point.x / largest, point.y / largest};
  const double scale = limit / scaled.length();
  const Vec2 projected = scaled * scale;
  if (projected.length() <= limit) {
    return projected;
  }
  return projected * (1 - 4 * std::numeric_limits<double>::epsilon());
}

[[nodiscard]] inline bool overlaps(Vec2 a, double a_radius, Vec2 b, double b_radius) {
  return (a - b).length() < a_radius + b_radius;
}

}  // namespace wave::sim
