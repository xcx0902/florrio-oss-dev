#pragma once
#include "engine/sim/quadtree.hpp"
#include "engine/model/entity.hpp"
#include <limits>
namespace engine {
/** Persistent broad phase belongs to one world; reset invalidates its epoch. */
struct CollisionContext {
  QuadTree tree{Aabb{f32(-25500.0F), f32(-2500.0F), f32(25500.0F), f32(2500.0F)}, 4, 9};
  std::uint64_t tick = std::numeric_limits<std::uint64_t>::max();
  struct Body { EntityHandle handle; Entity* entity; };
  std::vector<Body> bodies;
  std::vector<bool> present = std::vector<bool>(kEntitySlotCount,false);
  std::vector<std::uint32_t> touched;
  std::array<int,kEntitySlotCount> body_by_slot{};
  std::array<std::uint32_t,kEntitySlotCount> stamps{};
  std::uint32_t stamp = 0;
  std::vector<std::size_t> candidates, candidate_pool, offsets;
  bool prepared = false;
  void reset() {
    tree.clear(); tick = std::numeric_limits<std::uint64_t>::max(); prepared = false;
    bodies.clear(); candidates.clear(); candidate_pool.clear(); offsets.clear();
    for (auto slot : touched) present[slot] = false;
    touched.clear(); stamps.fill(0); stamp = 0;
  }
};
}
