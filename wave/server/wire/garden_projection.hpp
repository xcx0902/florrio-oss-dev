#pragma once

#include "app/garden.hpp"

#include <map>
#include <tuple>

namespace wave::wire {

struct GardenSnapshot {
  Bytes records;
  Bytes commands;
  std::vector<std::uint32_t> removed;
  std::optional<sim::LifeId> control;
};

// Per-socket baseline. Sim identities never escape as raw client pointers.
class GardenProjection {
 public:
  GardenSnapshot
  build(const app::Garden& garden, const app::Member& viewer,
        std::chrono::steady_clock::time_point now = std::chrono::steady_clock::now());

 private:
  using Key = std::tuple<std::uint64_t, std::uint32_t, std::uint64_t>;
  std::map<Key, std::uint32_t> handles_;
  struct Rendered {
    Bytes record;
    std::size_t flags_offset;
    std::size_t position_offset;
    double max_health;
    std::optional<sim::PlayerId> flower;
    std::optional<std::chrono::steady_clock::time_point> expires;
  };
  std::map<Key, Rendered> rendered_;
  std::uint64_t match_ = 0;
  std::uint64_t hit_cursor_ = 0;
  std::uint64_t arc_cursor_ = 0;
  std::uint64_t drop_cursor_ = 0;
  std::vector<std::uint32_t> generations_{16, 1};
  std::vector<std::uint32_t> free_;
  std::uint32_t next_slot_ = 16;
  bool had_roster_ = false;
  bool had_world_ = false;
  std::uint32_t handle(const sim::EntityId& id);
};

}  // namespace wave::wire
