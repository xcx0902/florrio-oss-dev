#pragma once
#include "engine/sim/quadtree.hpp"
#include <limits>
namespace engine {
/** Persistent broad phase belongs to one world; reset invalidates its epoch. */
struct CollisionContext {
  QuadTree tree{Aabb{f32(-25500.0F), f32(-2500.0F), f32(25500.0F), f32(2500.0F)}, 4, 9};
  std::uint64_t tick = std::numeric_limits<std::uint64_t>::max();
  void reset() { tree.clear(); tick = std::numeric_limits<std::uint64_t>::max(); }
};
}
