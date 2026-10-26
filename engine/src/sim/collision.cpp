#include "engine/sim/collision.hpp"

namespace engine {

bool circles_overlap(Vec2 a, f32 radius_a, Vec2 b, f32 radius_b) {
  const f32 combined = radius_a + radius_b;
  return (b - a).length_squared() <= combined * combined;
}

} // namespace engine
