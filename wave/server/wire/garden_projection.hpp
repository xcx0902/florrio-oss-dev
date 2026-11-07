#pragma once

#include "app/garden.hpp"

#include <map>
#include <tuple>

namespace wave::wire {

struct GardenSnapshot {
  Bytes records;
  std::vector<std::uint32_t> removed;
  std::optional<sim::LifeId> control;
};

// Per-socket baseline. Sim identities never escape as raw client pointers.
class GardenProjection {
 public:
  GardenSnapshot build(const app::Garden& garden, const app::Member& viewer);

 private:
  using Key = std::tuple<std::uint64_t, std::uint32_t, std::uint64_t>;
  std::map<Key, std::uint32_t> handles_;
  std::vector<std::uint32_t> generations_{16, 1};
  std::vector<std::uint32_t> free_;
  std::uint32_t next_slot_ = 16;
  bool had_roster_ = false;
  bool had_world_ = false;
  std::uint32_t handle(const sim::EntityId& id);
};

}  // namespace wave::wire
